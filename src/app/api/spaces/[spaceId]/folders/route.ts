import { folderSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createFolder } from "@/server/services/spaces";

type Context = { params: Promise<{ spaceId: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { name } = await readJson(request, folderSchema);
  return json(await createFolder(user.id, (await params).spaceId, name), 201);
});
