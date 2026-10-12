import { z } from "zod";
import { handle, json, requireUser } from "@/server/http";
import { listActivity } from "@/server/services/details";

type Context = { params: Promise<{ listId: string }> };

const querySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().min(1).max(100).optional(),
});

export const GET = handle(async (request: Request, { params }: Context) => {
  const user = await requireUser();
  const query = querySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return json(await listActivity(user.id, (await params).listId, query));
});
