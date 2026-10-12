import { folderSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteFolder, renameFolder } from "@/server/services/spaces";

type Context = { params: Promise<{ folderId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { name } = await readJson(request, folderSchema);
  return json(await renameFolder(user.id, (await params).folderId, name));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  await deleteFolder(user.id, (await params).folderId);
  return noContent();
});
