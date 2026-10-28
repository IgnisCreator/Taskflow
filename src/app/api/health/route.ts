import { json } from "@/server/http";
import { db } from "@/server/db";

export const dynamic = "force-dynamic";

/**
 * For uptime checks and the container's HEALTHCHECK: is the app up and can it reach its database?
 * Public on purpose and it says nothing else: no versions, no error details.
 */
export async function GET() {
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("timeout")), 3000),
      ),
    ]);
    return json({ status: "ok", time: new Date().toISOString() });
  } catch {
    return json({ status: "unavailable" }, 503);
  }
}
