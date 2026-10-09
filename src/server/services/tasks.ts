import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { MAX_TASKS } from "@/lib/validations/tasks";
import type { CreateTaskInput, UpdateTaskInput } from "@/lib/validations/tasks";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { can } from "@/server/policies";
import {
  forbidden,
  projectNotFound,
  withProjectLock,
} from "@/server/project-lock";
import { getProject } from "@/server/services/projects";

const taskSelect = {
  id: true,
  columnId: true,
  title: true,
  description: true,
  priority: true,
  assigneeId: true,
  dueDate: true,
  position: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
} as const;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

/** Due dates leave as "YYYY-MM-DD"; the DATE column is read as UTC so no time zone can shift it. */
const toTask = (row: TaskRow) => ({
  ...row,
  dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
});

const toDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : value;

const notFound = () => new ApiError(404, "NOT_FOUND", "Task not found");

const invalid = (code: string, message: string) =>
  new ApiError(400, code, message);

async function assertAssignee(
  tx: Prisma.TransactionClient,
  projectId: string,
  assigneeId: string | null | undefined,
) {
  if (!assigneeId) return;
  const member = await tx.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: assigneeId } },
    select: { userId: true },
  });
  if (!member) {
    throw invalid(
      "INVALID_ASSIGNEE",
      "The assignee is not a member of this project",
    );
  }
}

/**
 * Consistent snapshot of a board: project, ordered columns with ordered tasks, and members.
 * One REPEATABLE READ transaction, so the data and `boardVersion` come from the same moment.
 */
export async function getBoard(userId: string, projectId: string) {
  return db.$transaction(
    async (tx) => {
      const project = await tx.project.findFirst({
        where: { id: projectId, members: { some: { userId } } },
        select: {
          id: true,
          name: true,
          description: true,
          ownerId: true,
          boardVersion: true,
          members: {
            select: {
              userId: true,
              role: true,
              user: { select: { name: true, image: true } },
            },
            orderBy: { user: { name: "asc" } },
          },
          columns: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              position: true,
              tasks: { orderBy: { position: "asc" }, select: taskSelect },
            },
          },
        },
      });
      if (!project) throw projectNotFound();

      const me = project.members.find((m) => m.userId === userId)!;
      return {
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          boardVersion: project.boardVersion,
          role: me.role,
          isOwner: project.ownerId === userId,
        },
        members: project.members.map((m) => ({
          userId: m.userId,
          name: m.user.name,
          image: m.user.image,
          role: m.role,
          isOwner: m.userId === project.ownerId,
        })),
        columns: project.columns.map((column) => ({
          ...column,
          tasks: column.tasks.map(toTask),
        })),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}

/**
 * Creates a task at the end of its column.
 * The id comes from the client: repeating a request whose response was lost returns the existing
 * task (200) instead of a duplicate, before any version check. An id that belongs to another
 * project is reported as not found.
 */
export async function createTask(
  userId: string,
  projectId: string,
  { expectedBoardVersion, ...input }: CreateTaskInput,
): Promise<{
  task: ReturnType<typeof toTask>;
  boardVersion: number;
  created: boolean;
}> {
  const replay = await findReplay(userId, projectId, input.id);
  if (replay) return replay;

  try {
    const { result, boardVersion } = await withProjectLock(
      userId,
      projectId,
      expectedBoardVersion,
      "task:write",
      async (tx) => {
        const column = await tx.boardColumn.findFirst({
          where: { id: input.columnId, projectId },
          select: { id: true },
        });
        if (!column)
          throw invalid(
            "INVALID_COLUMN",
            "The column is not part of this project",
          );
        await assertAssignee(tx, projectId, input.assigneeId);

        const total = await tx.task.count({ where: { projectId } });
        if (total >= MAX_TASKS) {
          throw new ApiError(
            409,
            "LIMIT_REACHED",
            `A project has at most ${MAX_TASKS} tasks`,
          );
        }
        const position = await tx.task.count({
          where: { projectId, columnId: column.id },
        });
        return tx.task.create({
          data: {
            id: input.id,
            projectId,
            columnId: column.id,
            title: input.title,
            description: input.description,
            priority: input.priority,
            assigneeId: input.assigneeId,
            dueDate: toDate(input.dueDate),
            position,
            createdById: userId,
          },
          select: taskSelect,
        });
      },
    );
    return { task: toTask(result), boardVersion, created: true };
  } catch (error) {
    // Two identical requests raced: the loser finds the winner's row.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replayed = await findReplay(userId, projectId, input.id);
      if (replayed) return replayed;
    }
    throw error;
  }
}

async function findReplay(userId: string, projectId: string, taskId: string) {
  const existing = await db.task.findUnique({
    where: { id: taskId },
    select: { ...taskSelect, projectId: true },
  });
  if (!existing) return null;

  const project = await getProject(userId, projectId);
  // Someone else's task id, or a project the caller cannot see: nothing to reveal.
  if (existing.projectId !== projectId || !project) throw notFound();
  if (!can(project, "task:write")) throw forbidden();

  const { projectId: _projectId, ...row } = existing;
  return {
    task: toTask(row),
    boardVersion: project.boardVersion,
    created: false,
  };
}

export async function updateTask(
  userId: string,
  projectId: string,
  taskId: string,
  { expectedBoardVersion, ...changes }: UpdateTaskInput,
) {
  const { result, boardVersion } = await withProjectLock(
    userId,
    projectId,
    expectedBoardVersion,
    "task:write",
    async (tx) => {
      // A task of another project is not found, even if the caller belongs to both.
      const task = await tx.task.findFirst({
        where: { id: taskId, projectId },
        select: { id: true },
      });
      if (!task) throw notFound();
      await assertAssignee(tx, projectId, changes.assigneeId);

      return tx.task.update({
        where: { id: taskId },
        data: {
          ...changes,
          dueDate: toDate(changes.dueDate),
        },
        select: taskSelect,
      });
    },
  );
  return { task: toTask(result), boardVersion };
}

/** Deletes the task and closes the gap so positions in its column stay 0..n-1. */
export async function deleteTask(
  userId: string,
  projectId: string,
  taskId: string,
  expectedBoardVersion: number,
) {
  await withProjectLock(
    userId,
    projectId,
    expectedBoardVersion,
    "task:write",
    async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, projectId },
        select: { columnId: true, position: true },
      });
      if (!task) throw notFound();

      await tx.task.delete({ where: { id: taskId } });
      await tx.task.updateMany({
        where: {
          projectId,
          columnId: task.columnId,
          position: { gt: task.position },
        },
        data: { position: { decrement: 1 } },
      });
    },
  );
}
