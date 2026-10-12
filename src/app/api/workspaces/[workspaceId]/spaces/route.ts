import { createSpaceSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createSpace } from "@/server/services/spaces";

type Context = { params: Promise<{ workspaceId: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, createSpaceSchema);
  return json(
    await createSpace(user.id, (await params).workspaceId, input),
    201,
  );
});
