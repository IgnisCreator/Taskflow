import {
  assertSameOrigin,
  handle,
  noContent,
  requireUser,
} from "@/server/http";
import { removeSpaceMember } from "@/server/services/spaces";

type Context = { params: Promise<{ spaceId: string; userId: string }> };

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { spaceId, userId } = await params;
  await removeSpaceMember(user.id, spaceId, userId);
  return noContent();
});
