import {
  updateListSchema,
  versionedSchema,
} from "@/lib/validations/workspaces";
import {
  ApiError,
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteList, getList, updateList } from "@/server/services/lists";

type Context = { params: Promise<{ listId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  const list = await getList(user.id, (await params).listId);
  if (!list) throw new ApiError(404, "NOT_FOUND", "List not found");
  return json(list);
});

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, updateListSchema);
  return json(await updateList(user.id, (await params).listId, input));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { expectedBoardVersion } = await readJson(request, versionedSchema);
  await deleteList(user.id, (await params).listId, expectedBoardVersion);
  return noContent();
});
