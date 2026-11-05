import { z } from "zod";
import {
  assertSameOrigin,
  handle,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { markRead } from "@/server/services/notifications";

const bodySchema = z.strictObject({
  id: z.string().min(1).max(100).optional(),
});

/** Marks one alert as read (with `id`) or all of the caller's alerts (without it). */
export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { id } = await readJson(request, bodySchema);
  await markRead(user.id, id);
  return noContent();
});
