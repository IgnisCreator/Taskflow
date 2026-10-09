import "server-only";
import type {
  CreateProjectInput,
  ListProjectsQuery,
  UpdateProjectInput,
} from "@/lib/validations/projects";
import { db } from "@/server/db";
import { withProjectLock } from "@/server/project-lock";

const DEFAULT_COLUMNS = ["To do", "In progress", "In review", "Done"];

export const projectSelect = (userId: string) =>
  ({
    id: true,
    name: true,
    description: true,
    ownerId: true,
    boardVersion: true,
    createdAt: true,
    members: { where: { userId }, select: { role: true } },
  }) as const;

type Row = Awaited<ReturnType<typeof findVisible>>;

function findVisible(userId: string, projectId: string) {
  return db.project.findFirst({
    where: { id: projectId, members: { some: { userId } } },
    select: projectSelect(userId),
  });
}

function toView(row: NonNullable<Row>, userId: string) {
  const { members, ...project } = row;
  return {
    ...project,
    role: members[0]!.role,
    isOwner: project.ownerId === userId,
  };
}

/** One nested create is one transaction: project, owner membership and four columns, or nothing. */
export async function createProject(
  ownerId: string,
  input: CreateProjectInput,
) {
  const row = await db.project.create({
    data: {
      ...input,
      ownerId,
      members: { create: { userId: ownerId, role: "ADMIN" } },
      columns: {
        create: DEFAULT_COLUMNS.map((name, position) => ({ name, position })),
      },
    },
    select: projectSelect(ownerId),
  });
  return toView(row, ownerId);
}

export async function listProjects(userId: string, query: ListProjectsQuery) {
  const rows = await db.project.findMany({
    where: { members: { some: { userId } } },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: query.limit + 1,
    ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    select: projectSelect(userId),
  });
  const page = rows.slice(0, query.limit);
  return {
    items: page.map((row) => toView(row, userId)),
    nextCursor: rows.length > query.limit ? page[page.length - 1]!.id : null,
  };
}

/** A project the user cannot see is reported as missing, never as forbidden. */
export async function getProject(userId: string, projectId: string) {
  const row = await findVisible(userId, projectId);
  return row ? toView(row, userId) : null;
}

export async function updateProject(
  userId: string,
  projectId: string,
  { expectedBoardVersion, ...changes }: UpdateProjectInput,
) {
  const { result } = await withProjectLock(
    userId,
    projectId,
    expectedBoardVersion,
    "project:edit",
    (tx) =>
      tx.project.update({
        where: { id: projectId },
        data: changes,
        select: projectSelect(userId),
      }),
  );
  return toView(result, userId);
}

export async function deleteProject(
  userId: string,
  projectId: string,
  expectedBoardVersion: number,
) {
  await withProjectLock(
    userId,
    projectId,
    expectedBoardVersion,
    "project:delete",
    (tx) => tx.project.delete({ where: { id: projectId } }),
  );
}
