import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { githubUser, stubGithub } from "../helpers/github";
import { testAuth } from "../helpers/test-auth";

let requestHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => requestHeaders }));

const { auth } = await import("@/server/auth");
const { db } = await import("@/server/db");
const { GET: me } = await import("@/app/api/me/route");

const BASE = "http://localhost:3000";
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

/** Full OAuth round trip against the real handler; only GitHub itself is simulated. */
async function loginWithGithub() {
  const start = await auth.api.signInSocial({
    body: { provider: "github", callbackURL: "/profile" },
    asResponse: true,
  });
  const { url } = (await start.json()) as { url: string };
  const state = new URL(url).searchParams.get("state");
  const callback = await auth.handler(
    new Request(`${BASE}/api/auth/callback/github?code=fake&state=${state}`, {
      headers: { cookie: cookieOf(start) },
    }),
  );
  return cookieOf(callback);
}

async function meWith(cookie: string) {
  requestHeaders = new Headers(cookie ? { cookie } : {});
  return me();
}

async function cleanup() {
  await db.user.deleteMany({ where: { email: { endsWith: "@example.test" } } });
}

beforeAll(cleanup);
afterAll(cleanup);
beforeEach(() => stubGithub());

describe("GitHub login", () => {
  it("keeps the same user and a single account on a second login", async () => {
    await loginWithGithub();
    await loginWithGithub();

    const users = await db.user.findMany({
      where: { email: githubUser.email },
    });
    expect(users).toHaveLength(1);
    expect(users[0]?.publicId).toMatch(/^[0-9a-f-]{36}$/);
    expect(users[0]?.publicId).not.toBe(users[0]?.id);

    const accounts = await db.account.findMany({
      where: { providerId: "github", accountId: String(githubUser.id) },
    });
    expect(accounts).toHaveLength(1);
    expect(accounts[0]?.userId).toBe(users[0]?.id);
  });

  it("does not store the provider access token in plain text", async () => {
    await loginWithGithub();
    const account = await db.account.findFirstOrThrow({
      where: { accountId: String(githubUser.id) },
    });
    expect(account.accessToken).toBeTruthy();
    expect(account.accessToken).not.toContain("gho_plain_text_token");
  });
});

describe("session API", () => {
  it("answers 401 without a session cookie", async () => {
    const res = await meWith("");
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("UNAUTHENTICATED");
  });

  it("returns the profile with a valid session and never exposes tokens", async () => {
    const cookie = await loginWithGithub();
    const res = await meWith(cookie);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.publicId).toBeTruthy();
    expect(JSON.stringify(body)).not.toMatch(/token|secret|email/i);
  });

  it("rejects the old cookie after logout", async () => {
    const cookie = await loginWithGithub();
    expect((await meWith(cookie)).status).toBe(200);

    await auth.api.signOut({ headers: new Headers({ cookie }) });

    expect((await meWith(cookie)).status).toBe(401);
  });
});

describe("request origin protection", () => {
  const post = (path: string, headers: Record<string, string>, body: object) =>
    auth.handler(
      new Request(`${BASE}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify(body),
      }),
    );

  it("rejects a foreign Origin on a request that carries a session cookie", async () => {
    const cookie = await loginWithGithub();
    const res = await post(
      "/sign-out",
      { origin: "https://evil.example", cookie },
      {},
    );
    expect(res.status).toBe(403);
    expect((await meWith(cookie)).status).toBe(200);
  });

  it("rejects a callbackURL on another site", async () => {
    const res = await post(
      "/sign-in/social",
      { origin: BASE },
      { provider: "github", callbackURL: "https://evil.example/steal" },
    );
    expect(res.status).toBe(403);
  });
});

describe("test session fixture", () => {
  it("creates a usable session without GitHub", async () => {
    const ctx = await testAuth.$context;
    const user = ctx.test.createUser({
      email: "fixture@example.test",
      name: "Fixture",
    });
    await ctx.test.saveUser(user);
    const headers = await ctx.test.getAuthHeaders({ userId: user.id });

    expect((await meWith(headers.get("cookie") ?? "")).status).toBe(200);
  });
});
