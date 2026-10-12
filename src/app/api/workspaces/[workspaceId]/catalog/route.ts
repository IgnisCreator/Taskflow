import { handle, json, requireUser } from "@/server/http";
import { listCatalog } from "@/server/services/catalog";

type Context = { params: Promise<{ workspaceId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  return json(await listCatalog(user.id, (await params).workspaceId));
});
