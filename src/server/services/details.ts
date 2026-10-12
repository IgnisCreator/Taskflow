import "server-only";
import { MAX_SUBTASKS } from "@/lib/validations/details";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import {
  forbidden,
  notFound,
  readListAccess,
  withListAccess,
  type Tx,
} from "@/server/locks";
import { can } from "@/server/policies";

const missing = () => notFound("Task");

/** The task must belong to the list (a task of another list is not found, even for someone in both). */
async function assertTask(tx: Tx, listId: string, taskId: string) {
  if (!(await tx.task.count({ where: { id: taskId, listId } })))
    throw missing();
}

const eventSelect = {
  id: true,
  type: true,
  at: true,
  fromCategory: true,
  toCategory: true,
  fromStage: { select: { name: true } },
  toStage: { select: { name: true } },
  task: { select: { id: true, title: true } },
  actorId: true,
} as const;

/** Who did it: names of the actors for a set of events (events keep only the id). */
async function withActors<T extends { actorId: string }>(tx: Tx, events: T[]) {
  const users = await tx.user.findMany({
    where: { id: { in: [...new Set(events.map((e) => e.actorId))] } },
    select: { id: true, name: true },
  });
  const names = new Map(users.map((u) => [u.id, u.name]));
  return events.map(({ actorId, ...event }) => ({
    ...event,
    actor: names.get(actorId) ?? "Someone",
  }));
}

/**
 * Everything the task dialog shows beyond the board card: the checklist, the comments and the
 * history of this task, newest first. Anyone who can see the list can read it.
 */
export async function getTaskDetail(
  userId: string,
  listId: string,
  taskId: string,
) {
  return db.$transaction(async (tx) => {
    if (!(await readListAccess(tx, userId, listId))) throw notFound("List");
    await assertTask(tx, listId, taskId);
    const [subtasks, comments, events] = await Promise.all([
      tx.subtask.findMany({
        where: { taskId },
        orderBy: { position: "asc" },
        select: { id: true, title: true, done: true },
      }),
      tx.comment.findMany({
        where: { taskId },
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          createdAt: true,
          author: { select: { id: true, name: true } },
        },
      }),
      tx.taskEvent.findMany({
        where: { taskId },
        orderBy: [{ at: "desc" }, { id: "desc" }],
        take: 50,
        select: eventSelect,
      }),
    ]);
    return { subtasks, comments, events: await withActors(tx, events) };
  });
}

/** The latest events of a whole list, newest first, with a cursor (the id of the last event seen). */
export async function listActivity(
  userId: string,
  listId: string,
  { limit, cursor }: { limit: number; cursor?: string },
) {
  return db.$transaction(async (tx) => {
    if (!(await readListAccess(tx, userId, listId))) throw notFound("List");
    const rows = await tx.taskEvent.findMany({
      where: { listId },
      orderBy: [{ at: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: eventSelect,
    });
    const page = rows.slice(0, limit);
    return {
      items: await withActors(tx, page),
      nextCursor: rows.length > limit ? page[page.length - 1]!.id : null,
    };
  });
}

export async function createSubtask(
  userId: string,
  listId: string,
  taskId: string,
  title: string,
) {
  return withListAccess(userId, listId, "task:write", async (tx) => {
    await assertTask(tx, listId, taskId);
    const count = await tx.subtask.count({ where: { taskId } });
    if (count >= MAX_SUBTASKS) {
      throw new ApiError(
        409,
        "LIMIT_REACHED",
        `A task has at most ${MAX_SUBTASKS} subtasks`,
      );
    }
    return tx.subtask.create({
      data: { taskId, title, position: count },
      select: { id: true, title: true, done: true },
    });
  });
}

export async function updateSubtask(
  userId: string,
  listId: string,
  taskId: string,
  subtaskId: string,
  changes: { title?: string; done?: boolean },
) {
  return withListAccess(userId, listId, "task:write", async (tx) => {
    await assertTask(tx, listId, taskId);
    // A subtask of another task is not found, whatever its id.
    const found = await tx.subtask.updateMany({
      where: { id: subtaskId, taskId },
      data: changes,
    });
    if (found.count === 0) throw notFound("Subtask");
    return tx.subtask.findUniqueOrThrow({
      where: { id: subtaskId },
      select: { id: true, title: true, done: true },
    });
  });
}

/** Deletes the subtask and closes the gap so positions stay 0..n-1. */
export async function deleteSubtask(
  userId: string,
  listId: string,
  taskId: string,
  subtaskId: string,
) {
  await withListAccess(userId, listId, "task:write", async (tx) => {
    await assertTask(tx, listId, taskId);
    const subtask = await tx.subtask.findFirst({
      where: { id: subtaskId, taskId },
      select: { position: true },
    });
    if (!subtask) throw notFound("Subtask");
    await tx.subtask.delete({ where: { id: subtaskId } });
    await tx.subtask.updateMany({
      where: { taskId, position: { gt: subtask.position } },
      data: { position: { decrement: 1 } },
    });
  });
}

export async function createComment(
  userId: string,
  listId: string,
  taskId: string,
  body: string,
) {
  return withListAccess(userId, listId, "task:write", async (tx) => {
    await assertTask(tx, listId, taskId);
    return tx.comment.create({
      data: { taskId, authorId: userId, body },
      select: {
        id: true,
        body: true,
        createdAt: true,
        author: { select: { id: true, name: true } },
      },
    });
  });
}

/** The author deletes their own comment; OWNER and ADMIN can delete any. */
export async function deleteComment(
  userId: string,
  listId: string,
  taskId: string,
  commentId: string,
) {
  await withListAccess(userId, listId, "task:write", async (tx, actor) => {
    await assertTask(tx, listId, taskId);
    const comment = await tx.comment.findFirst({
      where: { id: commentId, taskId },
      select: { authorId: true },
    });
    if (!comment) throw notFound("Comment");
    if (comment.authorId !== userId && !can(actor, "structure:manage")) {
      throw forbidden();
    }
    await tx.comment.delete({ where: { id: commentId } });
  });
}
