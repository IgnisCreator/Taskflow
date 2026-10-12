import { templateSchema } from "@/lib/validations/workflow";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createTemplate, listTemplates } from "@/server/services/templates";

type Context = { params: Promise<{ workspaceId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  return json(await listTemplates(user.id, (await params).workspaceId));
});

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, templateSchema);
  return json(
    await createTemplate(user.id, (await params).workspaceId, input),
    201,
  );
});
