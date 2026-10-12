import { parseKind } from "@/lib/catalog-kind";
import { catalogItemSchema } from "@/lib/validations/details";
import {
  ApiError,
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createCatalogItem } from "@/server/services/catalog";

type Context = { params: Promise<{ workspaceId: string; kind: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { workspaceId, kind: raw } = await params;
  const kind = parseKind(raw);
  if (!kind) throw new ApiError(404, "NOT_FOUND", "Not found");
  const { name } = await readJson(request, catalogItemSchema);
  return json(await createCatalogItem(user.id, workspaceId, kind, name), 201);
});
