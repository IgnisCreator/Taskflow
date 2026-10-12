import { createCommentSchema } from "@/lib/validations/details";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createComment } from "@/server/services/details";

type Context = { params: Promise<{ listId: string; taskId: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { listId, taskId } = await params;
  const { body } = await readJson(request, createCommentSchema);
  return json(await createComment(user.id, listId, taskId, body), 201);
});
