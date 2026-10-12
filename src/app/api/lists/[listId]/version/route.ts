import { ApiError, handle, json, requireUser } from "@/server/http";
import { getList } from "@/server/services/lists";

type Context = { params: Promise<{ listId: string }> };

// Polled by open boards; any member may read it. Never cached (see json()).
export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  const list = await getList(user.id, (await params).listId);
  if (!list) throw new ApiError(404, "NOT_FOUND", "List not found");
  return json({ boardVersion: list.boardVersion });
});
