import { versionedSchema } from "@/lib/validations/workspaces";
import { updateTaskSchema } from "@/lib/validations/tasks";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { getTaskDetail } from "@/server/services/details";
import { deleteTask, updateTask } from "@/server/services/tasks";

type Context = { params: Promise<{ listId: string; taskId: string }> };

/** Checklist, comments and history of the task, for its dialog. */
export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  const { listId, taskId } = await params;
  return json(await getTaskDetail(user.id, listId, taskId));
});

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { listId, taskId } = await params;
  const input = await readJson(request, updateTaskSchema);
  return json(await updateTask(user.id, listId, taskId, input));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { listId, taskId } = await params;
  const { expectedBoardVersion } = await readJson(request, versionedSchema);
  await deleteTask(user.id, listId, taskId, expectedBoardVersion);
  return noContent();
});
