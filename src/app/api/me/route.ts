import { z } from "zod";
import {
  assertNotDemo,
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { db } from "@/server/db";

export const GET = handle(async () => json(await requireUser()));

const preferencesSchema = z.strictObject({ digestEmail: z.boolean() });

/** The user's own preferences: today only the optional daily email. */
export const PATCH = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  assertNotDemo(user);
  const data = await readJson(request, preferencesSchema);
  await db.user.update({ where: { id: user.id }, data });
  return json({ digestEmail: data.digestEmail });
});
