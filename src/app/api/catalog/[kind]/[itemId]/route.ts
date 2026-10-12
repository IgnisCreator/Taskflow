import { parseKind } from "@/lib/catalog-kind";
import { catalogItemSchema } from "@/lib/validations/details";
import {
  ApiError,
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import {
  deleteCatalogItem,
  renameCatalogItem,
} from "@/server/services/catalog";

type Context = { params: Promise<{ kind: string; itemId: string }> };

const kindOf = (raw: string) => {
  const kind = parseKind(raw);
  if (!kind) throw new ApiError(404, "NOT_FOUND", "Not found");
  return kind;
};

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { kind, itemId } = await params;
  const { name } = await readJson(request, catalogItemSchema);
  return json(await renameCatalogItem(user.id, kindOf(kind), itemId, name));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { kind, itemId } = await params;
  await deleteCatalogItem(user.id, kindOf(kind), itemId);
  return noContent();
});
