import { changeMemberRoleSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { changeMemberRole, removeMember } from "@/server/services/members";

type Context = { params: Promise<{ workspaceId: string; userId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { workspaceId, userId } = await params;
  const { role } = await readJson(request, changeMemberRoleSchema);
  return json(await changeMemberRole(user.id, workspaceId, userId, role));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { workspaceId, userId } = await params;
  await removeMember(user.id, workspaceId, userId);
  return noContent();
});
