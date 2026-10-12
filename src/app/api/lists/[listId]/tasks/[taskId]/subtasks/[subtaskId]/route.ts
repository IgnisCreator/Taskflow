import { updateSubtaskSchema } from "@/lib/validations/details";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteSubtask, updateSubtask } from "@/server/services/details";

type Context = {
  params: Promise<{ listId: string; taskId: string; subtaskId: string }>;
};

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { listId, taskId, subtaskId } = await params;
  const changes = await readJson(request, updateSubtaskSchema);
  return json(await updateSubtask(user.id, listId, taskId, subtaskId, changes));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { listId, taskId, subtaskId } = await params;
  await deleteSubtask(user.id, listId, taskId, subtaskId);
  return noContent();
});
