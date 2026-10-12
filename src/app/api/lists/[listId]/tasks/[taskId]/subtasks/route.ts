import { createSubtaskSchema } from "@/lib/validations/details";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createSubtask } from "@/server/services/details";

type Context = { params: Promise<{ listId: string; taskId: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { listId, taskId } = await params;
  const { title } = await readJson(request, createSubtaskSchema);
  return json(await createSubtask(user.id, listId, taskId, title), 201);
});
