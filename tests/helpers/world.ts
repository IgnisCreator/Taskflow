import { db } from "@/server/db";
import { createWorkspace } from "@/server/services/workspaces";
import { createActor, type Actor } from "./actors";

export type World = Awaited<ReturnType<typeof createWorld>>;

/**
 * The five kinds of caller of the permission matrix (owner, admin, member, guest, stranger), plus a
 * registered user who is in no workspace yet (to be added by email).
 */
export async function createWorld() {
  return {
    owner: await createActor("owner"),
    admin: await createActor("admin"),
    member: await createActor("member"),
    guest: await createActor("guest"),
    stranger: await createActor("stranger"),
    candidate: await createActor("candidate"),
  };
}

const COLUMNS = ["To do", "In progress", "In review", "Done"];

/**
 * A fresh workspace with every role present. Its first space ("General", public) lists the guest, so
 * the guest can read it; it holds one folder and one list with one task assigned to `member`.
 * With `privateSpace`, the list lives instead in a private space where nobody is listed.
 */
export async function createListFor(
  world: World,
  { privateSpace = false }: { privateSpace?: boolean } = {},
) {
  const { id: workspaceId } = await createWorkspace(world.owner.id, "Fixture");
  await db.workspaceMember.createMany({
    data: [
      { workspaceId, userId: world.admin.id, role: "ADMIN" },
      { workspaceId, userId: world.member.id, role: "MEMBER" },
      { workspaceId, userId: world.guest.id, role: "GUEST" },
    ],
  });
  const general = await db.space.findFirstOrThrow({ where: { workspaceId } });
  await db.spaceMember.create({
    data: { spaceId: general.id, workspaceId, userId: world.guest.id },
  });
  const folder = await db.folder.create({
    data: { spaceId: general.id, name: "Folder" },
  });
  const space = privateSpace
    ? await db.space.create({
        data: { workspaceId, name: "Private", isPrivate: true },
      })
    : general;
  const list = await db.list.create({
    data: {
      spaceId: space.id,
      name: "Fixture list",
      columns: {
        create: COLUMNS.map((name, position) => ({ name, position })),
      },
    },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  const task = await db.task.create({
    data: {
      listId: list.id,
      columnId: list.columns[0]!.id,
      title: "Assigned to member",
      position: 0,
      assigneeId: world.member.id,
      createdById: world.owner.id,
    },
  });
  return {
    workspaceId,
    spaceId: space.id,
    folderId: folder.id,
    listId: list.id,
    taskId: task.id,
  };
}

/** Everything a rejected request must leave untouched, from the workspace down to the tasks. */
export async function snapshot(workspaceId: string) {
  const row = await db.workspace.findUnique({
    where: { id: workspaceId },
    include: {
      members: { orderBy: { userId: "asc" } },
      spaces: {
        orderBy: { id: "asc" },
        include: {
          members: { orderBy: { userId: "asc" } },
          folders: { orderBy: { id: "asc" } },
          lists: {
            orderBy: { id: "asc" },
            include: {
              columns: { orderBy: { position: "asc" } },
              tasks: { orderBy: { id: "asc" } },
            },
          },
        },
      },
    },
  });
  return JSON.stringify(row);
}

export type { Actor };

/** What a rejected task or move request must leave untouched: one list, its columns and tasks. */
export async function snapshotList(listId: string) {
  const row = await db.list.findUnique({
    where: { id: listId },
    include: {
      columns: { orderBy: { position: "asc" } },
      tasks: { orderBy: { id: "asc" } },
    },
  });
  return JSON.stringify(row);
}
