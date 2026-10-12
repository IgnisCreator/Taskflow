import { db } from "@/server/db";
import { setRequestHeaders } from "./request-context";
import { testAuth } from "./test-auth";

export type Actor = { id: string; email: string; cookie: string };

/** A real user with a real database session, created through the test-only helpers. */
export async function createActor(label: string): Promise<Actor> {
  const ctx = await testAuth.$context;
  const user = ctx.test.createUser({
    email: `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`,
    name: label,
  });
  await ctx.test.saveUser(user);
  const headers = await ctx.test.getAuthHeaders({ userId: user.id });
  return {
    id: user.id,
    email: user.email,
    cookie: headers.get("cookie") ?? "",
  };
}

/** Calls a route handler as `actor` (or anonymously with null) with Next-style params. */
export function callAs<P extends object>(
  actor: Actor | null,
  handler: (
    request: Request,
    context: { params: Promise<P> },
  ) => Promise<Response>,
  request: Request,
  params?: P,
) {
  setRequestHeaders(new Headers(actor ? { cookie: actor.cookie } : {}));
  return handler(request, { params: Promise.resolve(params as P) });
}

export async function cleanupTestData() {
  // Workspaces first (with everything in them): their members are protected by a foreign key.
  await db.workspace.deleteMany({
    where: {
      members: {
        some: { role: "OWNER", user: { email: { endsWith: "@example.test" } } },
      },
    },
  });
  await db.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
}
