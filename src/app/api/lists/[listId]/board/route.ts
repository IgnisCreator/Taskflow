import { handle, json, requireUser } from "@/server/http";
import { getBoard } from "@/server/services/tasks";

type Context = { params: Promise<{ listId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  return json(await getBoard(user.id, (await params).listId));
});
