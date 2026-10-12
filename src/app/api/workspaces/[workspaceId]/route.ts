import { updateWorkspaceSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import {
  deleteWorkspace,
  getWorkspace,
  updateWorkspace,
} from "@/server/services/workspaces";

type Context = { params: Promise<{ workspaceId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  return json(await getWorkspace(user.id, (await params).workspaceId));
});

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, updateWorkspaceSchema);
  return json(
    await updateWorkspace(user.id, (await params).workspaceId, input),
  );
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  await deleteWorkspace(user.id, (await params).workspaceId);
  return noContent();
});
