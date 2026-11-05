import "server-only";
import { headers } from "next/headers";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

/** Current user from the database-backed session, or null. Always checked server-side. */
export async function getCurrentUser() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      image: true,
      publicId: true,
      isDemo: true,
      sandboxUntil: true,
    },
  });
  // A sandbox is over when its 24 hours are, whether or not the daily job has deleted it yet.
  if (user?.sandboxUntil && user.sandboxUntil.getTime() <= Date.now()) {
    return null;
  }
  return user;
}
