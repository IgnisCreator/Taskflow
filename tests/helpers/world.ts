import { db } from "@/server/db";
import { createProject } from "@/server/services/projects";
import { createActor, type Actor } from "./actors";

export type World = Awaited<ReturnType<typeof createWorld>>;

/** The five kinds of caller of the permission matrix, plus a registered user who is nobody's member. */
export async function createWorld() {
  const owner = await createActor("owner");
  const admin = await createActor("admin");
  const member = await createActor("member");
  const viewer = await createActor("viewer");
  const stranger = await createActor("stranger");
  const candidate = await createActor("candidate");
  const candidatePublicId = (
    await db.user.findUniqueOrThrow({
      where: { id: candidate.id },
      select: { publicId: true },
    })
  ).publicId;
  return {
    owner,
    admin,
    member,
    viewer,
    stranger,
    candidate,
    candidatePublicId,
  };
}

/** A fresh project with every role present and one task assigned to `member`. */
export async function createProjectFor(world: World) {
  const project = await createProject(world.owner.id, {
    name: "Fixture project",
    description: null,
  });
  await db.projectMember.createMany({
    data: [
      { projectId: project.id, userId: world.admin.id, role: "ADMIN" },
      { projectId: project.id, userId: world.member.id, role: "MEMBER" },
      { projectId: project.id, userId: world.viewer.id, role: "VIEWER" },
    ],
  });
  const column = await db.boardColumn.findFirstOrThrow({
    where: { projectId: project.id, position: 0 },
  });
  const task = await db.task.create({
    data: {
      projectId: project.id,
      columnId: column.id,
      title: "Assigned to member",
      position: 0,
      assigneeId: world.member.id,
      createdById: world.owner.id,
    },
  });
  return { projectId: project.id, taskId: task.id };
}

/** Everything a rejected request must leave untouched. */
export async function snapshot(projectId: string) {
  const row = await db.project.findUnique({
    where: { id: projectId },
    include: {
      members: { orderBy: { userId: "asc" } },
      tasks: { orderBy: { id: "asc" } },
      columns: { orderBy: { position: "asc" } },
    },
  });
  return JSON.stringify(row);
}

export type { Actor };
