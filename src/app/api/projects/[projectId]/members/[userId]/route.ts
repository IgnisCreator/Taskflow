import { changeMemberRoleSchema } from "@/lib/validations/members";
import { versionedSchema } from "@/lib/validations/projects";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { changeMemberRole, removeMember } from "@/server/services/members";

type Context = { params: Promise<{ projectId: string; userId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { projectId, userId } = await params;
  const input = await readJson(request, changeMemberRoleSchema);
  return json(await changeMemberRole(user.id, projectId, userId, input));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { projectId, userId } = await params;
  const { expectedBoardVersion } = await readJson(request, versionedSchema);
  await removeMember(user.id, projectId, userId, expectedBoardVersion);
  return noContent();
});
