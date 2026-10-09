import { versionedSchema } from "@/lib/validations/projects";
import { updateTaskSchema } from "@/lib/validations/tasks";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteTask, updateTask } from "@/server/services/tasks";

type Context = { params: Promise<{ projectId: string; taskId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { projectId, taskId } = await params;
  const input = await readJson(request, updateTaskSchema);
  return json(await updateTask(user.id, projectId, taskId, input));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { projectId, taskId } = await params;
  const { expectedBoardVersion } = await readJson(request, versionedSchema);
  await deleteTask(user.id, projectId, taskId, expectedBoardVersion);
  return noContent();
});
