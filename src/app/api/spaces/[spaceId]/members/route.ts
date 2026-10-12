import { spaceMemberSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { addSpaceMember, listSpaceMembers } from "@/server/services/spaces";

type Context = { params: Promise<{ spaceId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  return json(await listSpaceMembers(user.id, (await params).spaceId));
});

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { userId } = await readJson(request, spaceMemberSchema);
  await addSpaceMember(user.id, (await params).spaceId, userId);
  return noContent();
});
