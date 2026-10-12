import {
  assertSameOrigin,
  handle,
  noContent,
  requireUser,
} from "@/server/http";
import { deleteComment } from "@/server/services/details";

type Context = {
  params: Promise<{ listId: string; taskId: string; commentId: string }>;
};

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { listId, taskId, commentId } = await params;
  await deleteComment(user.id, listId, taskId, commentId);
  return noContent();
});
