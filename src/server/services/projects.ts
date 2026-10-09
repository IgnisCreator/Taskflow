import "server-only";
import type {
  CreateProjectInput,
  ListProjectsQuery,
} from "@/lib/validations/projects";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { can } from "@/server/policies";

const DEFAULT_COLUMNS = ["To do", "In progress", "In review", "Done"];

const notFound = () => new ApiError(404, "NOT_FOUND", "Project not found");
const forbidden = () => new ApiError(403, "FORBIDDEN", "Not allowed");

const projectSelect = (userId: string) =>
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

export async function deleteProject(
  userId: string,
  projectId: string,
  expectedBoardVersion: number,
) {
  const project = await getProject(userId, projectId);
  if (!project) throw notFound();
  if (!can(project, "project:delete")) throw forbidden();

  await db.$transaction(async (tx) => {
    // Optimistic lock: this UPDATE holds the project row until commit and fails on a stale version.
    const locked = await tx.project.updateMany({
      where: { id: projectId, boardVersion: expectedBoardVersion },
      data: { boardVersion: { increment: 1 } },
    });
    if (locked.count === 0) {
      const current = await tx.project.findUnique({
        where: { id: projectId },
        select: { boardVersion: true },
      });
      if (!current) throw notFound();
      throw new ApiError(409, "BOARD_CONFLICT", "The board changed", {
        currentVersion: current.boardVersion,
      });
    }
    // Authority is read again now that the row is locked.
    const fresh = await tx.project.findFirst({
      where: { id: projectId, members: { some: { userId } } },
      select: {
        ownerId: true,
        members: { where: { userId }, select: { role: true } },
      },
    });
    if (!fresh) throw notFound();
    const actor = {
      role: fresh.members[0]!.role,
      isOwner: fresh.ownerId === userId,
    };
    if (!can(actor, "project:delete")) throw forbidden();
    await tx.project.delete({ where: { id: projectId } });
  });
}
