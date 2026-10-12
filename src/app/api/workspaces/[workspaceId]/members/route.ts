import { addMemberSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { addMember, listMembers } from "@/server/services/members";

type Context = { params: Promise<{ workspaceId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  return json(await listMembers(user.id, (await params).workspaceId));
});

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, addMemberSchema);
  return json(await addMember(user.id, (await params).workspaceId, input), 201);
});
