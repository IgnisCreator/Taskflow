import { createWorkspaceSchema } from "@/lib/validations/workspaces";
import {
  assertNotDemo,
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createWorkspace, listWorkspaces } from "@/server/services/workspaces";

export const GET = handle(async () => {
  const user = await requireUser();
  return json(await listWorkspaces(user.id));
});

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  assertNotDemo(user);
  const { name } = await readJson(request, createWorkspaceSchema);
  return json(await createWorkspace(user.id, name), 201);
});
