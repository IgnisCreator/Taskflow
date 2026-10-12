import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { UNASSIGNED, type TaskFilter } from "@/lib/validations/filters";
import { MAX_TASKS } from "@/lib/validations/tasks";
import { moveEventType } from "@/lib/workflow";
import type {
  CreateTaskInput,
  MoveTaskInput,
  UpdateTaskInput,
} from "@/lib/validations/tasks";
import { db } from "@/server/db";
import { recordEvents } from "@/server/events";
import { ApiError } from "@/server/http";
import {
  forbidden,
  notFound as missing,
  readListAccess,
  withListLock,
} from "@/server/locks";
import { can, canSeeSpace } from "@/server/policies";
import { getList } from "@/server/services/lists";

const taskSelect = {
  id: true,
  columnId: true,
  title: true,
  description: true,
  priority: true,
  dueDate: true,
  blockedReason: true,
  position: true,
  createdById: true,
  createdAt: true,
  updatedAt: true,
  type: { select: { id: true, name: true } },
  assignees: { select: { userId: true } },
  labels: { select: { label: { select: { id: true, name: true } } } },
  subtasks: { select: { done: true } },
} as const;

type TaskRow = Prisma.TaskGetPayload<{ select: typeof taskSelect }>;

/**
 * What the API and the board see of a task. Due dates leave as "YYYY-MM-DD" (the DATE column is
 * read as UTC so no time zone can shift it); assignees as ids; subtasks only as a count.
 */
const toTask = ({ assignees, labels, subtasks, ...row }: TaskRow) => ({
  ...row,
  dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
  assigneeIds: assignees.map((a) => a.userId),
  labels: labels
    .map((l) => l.label)
    .sort((a, b) => a.name.localeCompare(b.name)),
  subtasks: {
    total: subtasks.length,
    done: subtasks.filter((x) => x.done).length,
  },
});

const toDate = (value: string | null | undefined) =>
  value ? new Date(`${value}T00:00:00.000Z`) : value;

const notFound = () => missing("Task");

const invalid = (code: string, message: string) =>
  new ApiError(400, code, message);

/** Every assignee must be someone who can see the list: a workspace member with access to its space. */
async function assertAssignees(
  tx: Prisma.TransactionClient,
  listId: string,
  assigneeIds: string[] | undefined,
) {
  for (const id of assigneeIds ?? []) {
    if (!(await readListAccess(tx, id, listId))) {
      throw invalid("INVALID_ASSIGNEE", "An assignee cannot see this list");
    }
  }
}

/** The type and the labels must belong to the workspace of the list. */
async function assertCatalog(
  tx: Prisma.TransactionClient,
  workspaceId: string,
  typeId: string | null | undefined,
  labelIds: string[] | undefined,
) {
  if (
    typeId &&
    !(await tx.workItemType.count({ where: { id: typeId, workspaceId } }))
  ) {
    throw invalid(
      "INVALID_TYPE",
      "That task type does not exist in this workspace",
    );
  }
  const ids = labelIds ?? [];
  if (
    ids.length &&
    (await tx.label.count({ where: { id: { in: ids }, workspaceId } })) !==
      ids.length
  ) {
    throw invalid("INVALID_LABEL", "A label does not exist in this workspace");
  }
}

/**
 * Consistent snapshot of a board: the list, ordered columns with ordered tasks, and the people who
 * can see it (the possible assignees).
 * One REPEATABLE READ transaction, so the data and `boardVersion` come from the same moment.
 * `filter` is applied in SQL; each column also reports `total`, its task count ignoring the filter.
 */
export async function getBoard(
  userId: string,
  listId: string,
  filter: TaskFilter = {},
) {
  // `contains` becomes ILIKE and Prisma does not escape the wildcards: "_" or "%" would match everything.
  const q = filter.q?.replace(/[\\%_]/g, (char) => `\\${char}`);
  const where: Prisma.TaskWhereInput = {
    priority: filter.priority,
    assignees:
      filter.assignee === UNASSIGNED
        ? { none: {} }
        : filter.assignee
          ? { some: { userId: filter.assignee } }
          : undefined,
    OR: q
      ? [
          { title: { contains: q, mode: "insensitive" } },
          { description: { contains: q, mode: "insensitive" } },
        ]
      : undefined,
  };
  return db.$transaction(
    async (tx) => {
      const access = await readListAccess(tx, userId, listId);
      if (!access) throw missing("List");
      const list = await tx.list.findUniqueOrThrow({
        where: { id: listId },
        select: {
          id: true,
          name: true,
          description: true,
          boardVersion: true,
          space: {
            select: {
              isPrivate: true,
              members: { select: { userId: true } },
              workspace: {
                select: {
                  members: {
                    select: {
                      userId: true,
                      role: true,
                      user: { select: { name: true, image: true } },
                    },
                    orderBy: { user: { name: "asc" } },
                  },
                },
              },
            },
          },
          columns: {
            orderBy: { position: "asc" },
            select: {
              id: true,
              name: true,
              position: true,
              category: true,
              isCommitmentPoint: true,
              wipLimit: true,
              policy: true,
              _count: { select: { tasks: true } },
              tasks: {
                where,
                orderBy: { position: "asc" },
                select: taskSelect,
              },
            },
          },
        },
      });
      const listed = new Set(list.space.members.map((m) => m.userId));
      return {
        list: {
          id: list.id,
          name: list.name,
          description: list.description,
          boardVersion: list.boardVersion,
          role: access.role,
          workspaceId: access.workspaceId,
          spaceId: access.spaceId,
        },
        members: list.space.workspace.members
          .filter((m) => canSeeSpace(m.role, list.space, listed.has(m.userId)))
          .map((m) => ({
            userId: m.userId,
            name: m.user.name,
            image: m.user.image,
            role: m.role,
          })),
        columns: list.columns.map(({ _count, ...column }) => ({
          ...column,
          total: _count.tasks,
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
 * list is reported as not found.
 */
export async function createTask(
  userId: string,
  listId: string,
  { expectedBoardVersion, ...input }: CreateTaskInput,
): Promise<{
  task: ReturnType<typeof toTask>;
  boardVersion: number;
  created: boolean;
}> {
  const replay = await findReplay(userId, listId, input.id);
  if (replay) return replay;

  try {
    const { result, boardVersion } = await withListLock(
      userId,
      listId,
      expectedBoardVersion,
      "task:write",
      async (tx, actor) => {
        const column = await tx.boardColumn.findFirst({
          where: { id: input.columnId, listId },
          select: { id: true, category: true },
        });
        if (!column)
          throw invalid(
            "INVALID_COLUMN",
            "The column is not part of this list",
          );
        await assertAssignees(tx, listId, input.assigneeIds);
        await assertCatalog(
          tx,
          actor.workspaceId,
          input.typeId,
          input.labelIds,
        );

        const total = await tx.task.count({ where: { listId } });
        if (total >= MAX_TASKS) {
          throw new ApiError(
            409,
            "LIMIT_REACHED",
            `A list has at most ${MAX_TASKS} tasks`,
          );
        }
        const position = await tx.task.count({
          where: { listId, columnId: column.id },
        });
        const task = await tx.task.create({
          data: {
            id: input.id,
            listId,
            columnId: column.id,
            title: input.title,
            description: input.description,
            priority: input.priority,
            typeId: input.typeId,
            assignees: {
              create: input.assigneeIds.map((id) => ({ userId: id })),
            },
            labels: { create: input.labelIds.map((labelId) => ({ labelId })) },
            dueDate: toDate(input.dueDate),
            position,
            createdById: userId,
          },
          select: taskSelect,
        });
        await recordEvents(tx, [
          {
            taskId: task.id,
            listId,
            type: "CREATED",
            to: column,
            actorId: userId,
          },
        ]);
        return task;
      },
    );
    return { task: toTask(result), boardVersion, created: true };
  } catch (error) {
    // Two identical requests raced: the loser finds the winner's row.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const replayed = await findReplay(userId, listId, input.id);
      if (replayed) return replayed;
    }
    throw error;
  }
}

async function findReplay(userId: string, listId: string, taskId: string) {
  const existing = await db.task.findUnique({
    where: { id: taskId },
    select: { ...taskSelect, listId: true },
  });
  if (!existing) return null;

  const list = await getList(userId, listId);
  // Someone else's task id, or a list the caller cannot see: nothing to reveal.
  if (existing.listId !== listId || !list) throw notFound();
  if (!can(list, "task:write")) throw forbidden();

  const { listId: _listId, ...row } = existing;
  return {
    task: toTask(row),
    boardVersion: list.boardVersion,
    created: false,
  };
}

export async function updateTask(
  userId: string,
  listId: string,
  taskId: string,
  { expectedBoardVersion, ...changes }: UpdateTaskInput,
) {
  const { result, boardVersion } = await withListLock(
    userId,
    listId,
    expectedBoardVersion,
    "task:write",
    async (tx, actor) => {
      // A task of another list is not found, even if the caller belongs to both.
      const task = await tx.task.findFirst({
        where: { id: taskId, listId },
        select: {
          blockedReason: true,
          column: { select: { id: true, category: true } },
        },
      });
      if (!task) throw notFound();
      const { assigneeIds, labelIds, typeId, blockedReason, ...fields } =
        changes;
      await assertAssignees(tx, listId, assigneeIds);
      await assertCatalog(tx, actor.workspaceId, typeId, labelIds);

      const updated = await tx.task.update({
        where: { id: taskId },
        data: {
          ...fields,
          dueDate: toDate(fields.dueDate),
          typeId,
          blockedReason,
          // Replacing a set: the new ids are the whole truth.
          assignees: assigneeIds && {
            deleteMany: {},
            create: assigneeIds.map((id) => ({ userId: id })),
          },
          labels: labelIds && {
            deleteMany: {},
            create: labelIds.map((id) => ({ labelId: id })),
          },
        },
        select: taskSelect,
      });
      // Blocking and unblocking are history; changing the reason of a blocked task is not.
      const was = task.blockedReason !== null;
      const is = blockedReason === undefined ? was : blockedReason !== null;
      if (was !== is) {
        await recordEvents(tx, [
          {
            taskId,
            listId,
            type: is ? "BLOCKED" : "UNBLOCKED",
            to: task.column,
            actorId: userId,
          },
        ]);
      }
      return updated;
    },
  );
  return { task: toTask(result), boardVersion };
}

/** Deletes the task and closes the gap so positions in its column stay 0..n-1. */
export async function deleteTask(
  userId: string,
  listId: string,
  taskId: string,
  expectedBoardVersion: number,
) {
  await withListLock(
    userId,
    listId,
    expectedBoardVersion,
    "task:write",
    async (tx) => {
      const task = await tx.task.findFirst({
        where: { id: taskId, listId },
        select: { columnId: true, position: true },
      });
      if (!task) throw notFound();

      await tx.task.delete({ where: { id: taskId } });
      await tx.task.updateMany({
        where: {
          listId,
          columnId: task.columnId,
          position: { gt: task.position },
        },
        data: { position: { decrement: 1 } },
      });
    },
  );
}

/** Thrown inside the lock to roll everything back, version bump included, when nothing would change. */
class NoChange extends Error {}

/**
 * Moves a task to `columnId` at `toIndex` (its final index there, not counting the task) and keeps
 * positions 0..n-1 in both columns. Everything happens under the list lock, so the version goes
 * up once and two moves with the same version cannot both succeed. A move that changes nothing
 * rolls back and answers with the current state.
 */
export async function moveTask(
  userId: string,
  listId: string,
  taskId: string,
  { expectedBoardVersion, columnId, toIndex }: MoveTaskInput,
) {
  try {
    const { result, boardVersion } = await withListLock(
      userId,
      listId,
      expectedBoardVersion,
      "task:write",
      async (tx) => {
        const task = await tx.task.findFirst({
          where: { id: taskId, listId },
          select: {
            columnId: true,
            position: true,
            column: { select: { id: true, category: true } },
          },
        });
        if (!task) throw notFound();
        const column = await tx.boardColumn.findFirst({
          where: { id: columnId, listId },
          select: { id: true, category: true },
        });
        if (!column)
          throw invalid(
            "INVALID_COLUMN",
            "The column is not part of this list",
          );

        const sameColumn = task.columnId === column.id;
        const inColumn = await tx.task.count({
          where: { listId, columnId: column.id },
        });
        const last = sameColumn ? inColumn - 1 : inColumn;
        if (toIndex > last) {
          throw invalid(
            "INVALID_POSITION",
            `The position must be between 0 and ${last}`,
          );
        }
        if (sameColumn && toIndex === task.position) throw new NoChange();

        if (sameColumn && toIndex > task.position) {
          await tx.task.updateMany({
            where: {
              listId,
              columnId: column.id,
              position: { gt: task.position, lte: toIndex },
            },
            data: { position: { decrement: 1 } },
          });
        } else if (sameColumn) {
          await tx.task.updateMany({
            where: {
              listId,
              columnId: column.id,
              position: { gte: toIndex, lt: task.position },
            },
            data: { position: { increment: 1 } },
          });
        } else {
          await tx.task.updateMany({
            where: {
              listId,
              columnId: task.columnId,
              position: { gt: task.position },
            },
            data: { position: { decrement: 1 } },
          });
          await tx.task.updateMany({
            where: {
              listId,
              columnId: column.id,
              position: { gte: toIndex },
            },
            data: { position: { increment: 1 } },
          });
        }
        const moved = await tx.task.update({
          where: { id: taskId },
          data: { columnId: column.id, position: toIndex },
          select: taskSelect,
        });
        // Only a change of stage is history; reordering inside a stage is not.
        if (!sameColumn) {
          await recordEvents(tx, [
            {
              taskId,
              listId,
              type: moveEventType(task.column.category, column.category),
              from: task.column,
              to: column,
              actorId: userId,
            },
          ]);
        }
        return moved;
      },
    );
    return { task: toTask(result), boardVersion };
  } catch (error) {
    if (!(error instanceof NoChange)) throw error;
    const [task, list] = await Promise.all([
      db.task.findUniqueOrThrow({ where: { id: taskId }, select: taskSelect }),
      db.list.findUniqueOrThrow({
        where: { id: listId },
        select: { boardVersion: true },
      }),
    ]);
    return { task: toTask(task), boardVersion: list.boardVersion };
  }
}
