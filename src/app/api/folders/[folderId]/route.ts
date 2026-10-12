import { updateFolderSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteFolder, updateFolder } from "@/server/services/spaces";

type Context = { params: Promise<{ folderId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const changes = await readJson(request, updateFolderSchema);
  return json(await updateFolder(user.id, (await params).folderId, changes));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  await deleteFolder(user.id, (await params).folderId);
  return noContent();
});
