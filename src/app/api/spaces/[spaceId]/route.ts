import { updateSpaceSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteSpace, updateSpace } from "@/server/services/spaces";

type Context = { params: Promise<{ spaceId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, updateSpaceSchema);
  return json(await updateSpace(user.id, (await params).spaceId, input));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  await deleteSpace(user.id, (await params).spaceId);
  return noContent();
});
