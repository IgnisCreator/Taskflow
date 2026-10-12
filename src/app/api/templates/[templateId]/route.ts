import { renameTemplateSchema } from "@/lib/validations/workflow";
import {
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteTemplate, updateTemplate } from "@/server/services/templates";

type Context = { params: Promise<{ templateId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const changes = await readJson(request, renameTemplateSchema);
  return json(
    await updateTemplate(user.id, (await params).templateId, changes),
  );
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  await deleteTemplate(user.id, (await params).templateId);
  return noContent();
});
