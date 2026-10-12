import "server-only";
import type { UpdateWorkspaceInput } from "@/lib/validations/workspaces";
import { db } from "@/server/db";
import { notFound, withWorkspaceLock } from "@/server/locks";
import { canSeeSpace } from "@/server/policies";

/** Creates the workspace with its creator as OWNER and a first public space, in one transaction. */
export async function createWorkspace(userId: string, name: string) {
  return db.workspace.create({
    data: {
      name,
      members: { create: { userId, role: "OWNER" } },
      spaces: { create: { name: "General" } },
    },
    select: { id: true, name: true },
  });
}

/** The caller's workspaces with their role, oldest first. */
export async function listWorkspaces(userId: string) {
  const rows = await db.workspaceMember.findMany({
    where: { userId },
    orderBy: { workspace: { createdAt: "asc" } },
    select: { role: true, workspace: { select: { id: true, name: true } } },
  });
  return rows.map(({ role, workspace }) => ({ ...workspace, role }));
}

/**
 * A workspace as the caller sees it: their role, the role labels, and the tree of the spaces they
 * can see, each with its folders and lists. Not a member: 404.
 */
export async function getWorkspace(userId: string, workspaceId: string) {
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, members: { some: { userId } } },
    select: {
      id: true,
      name: true,
      roleLabels: true,
      members: { where: { userId }, select: { role: true } },
      spaces: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        select: {
          id: true,
          name: true,
          isPrivate: true,
          members: { where: { userId }, select: { userId: true } },
          folders: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, name: true },
          },
          lists: {
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: { id: true, name: true, folderId: true },
          },
        },
      },
    },
  });
  if (!workspace) throw notFound("Workspace");
  const role = workspace.members[0]!.role;
  return {
    id: workspace.id,
    name: workspace.name,
    role,
    roleLabels: workspace.roleLabels as Record<string, string>,
    spaces: workspace.spaces
      .filter((space) => canSeeSpace(role, space, space.members.length > 0))
      .map(({ members: _members, folders, lists, ...space }) => ({
        ...space,
        folders: folders.map((folder) => ({
          ...folder,
          lists: lists.filter((list) => list.folderId === folder.id),
        })),
        lists: lists.filter((list) => list.folderId === null),
      })),
  };
}

export async function updateWorkspace(
  userId: string,
  workspaceId: string,
  changes: UpdateWorkspaceInput,
) {
  return withWorkspaceLock(userId, workspaceId, "workspace:edit", (tx) =>
    tx.workspace.update({
      where: { id: workspaceId },
      data: changes,
      select: { id: true, name: true, roleLabels: true },
    }),
  );
}

/** Deletes the workspace and everything in it (cascade). OWNER only. */
export async function deleteWorkspace(userId: string, workspaceId: string) {
  await withWorkspaceLock(userId, workspaceId, "workspace:delete", (tx) =>
    tx.workspace.delete({ where: { id: workspaceId } }),
  );
}
