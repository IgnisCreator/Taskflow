import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanupTestData } from "../helpers/actors";
import { setRequestHeaders } from "../helpers/request-context";

// The "mailbox": every email the app would send.
const sent = vi.hoisted(() => [] as { to: string; text: string }[]);
vi.mock("@/server/email", () => ({
  sendEmail: async (message: { to: string; text: string }) => {
    sent.push(message);
  },
}));

const { auth } = await import("@/server/auth");
const { db } = await import("@/server/db");
const { GET: me } = await import("@/app/api/me/route");

const email = "email-login@example.test";
const password = "correct horse battery";
const cookieOf = (res: Response) =>
  res.headers
    .getSetCookie()
    .map((c) => c.split(";")[0])
    .join("; ");

const signIn = (pw = password) =>
  auth.api.signInEmail({ body: { email, password: pw }, asResponse: true });

beforeAll(cleanupTestData);
afterAll(cleanupTestData);

describe("email + password login with confirmation", () => {
  it("sign-up sends a link, and signing in is refused until it is opened", async () => {
    const res = await auth.api.signUpEmail({
      body: { name: "Mail User", email, password },
      asResponse: true,
    });
    expect(res.status).toBe(200);
    expect(cookieOf(res)).not.toContain("session_token"); // no session yet
    expect(sent).toHaveLength(1);
    expect(sent[0]?.to).toBe(email);

    const refused = await signIn();
    expect(refused.status).toBe(403);
    expect(cookieOf(refused)).not.toContain("session_token");
    expect(sent).toHaveLength(2); // a fresh link on every attempt
  });

  it("opening the link verifies the address and signs the user in", async () => {
    const link = sent.at(-1)!.text.match(/https?:\/\/\S+/)![0];
    const token = new URL(link).searchParams.get("token")!;
    const verified = await auth.api.verifyEmail({
      query: { token },
      asResponse: true,
    });
    expect(verified.status).toBeLessThan(400);
    expect(
      (await db.user.findFirstOrThrow({ where: { email } })).emailVerified,
    ).toBe(true);

    const ok = await signIn();
    expect(ok.status).toBe(200);
    setRequestHeaders(new Headers({ cookie: cookieOf(ok) }));
    const profile = await (await me()).json();
    expect(profile.name).toBe("Mail User");
  });

  it("a wrong password and a tampered link are rejected", async () => {
    expect((await signIn("wrong password here")).status).toBe(401);
    const bad = await auth.api
      .verifyEmail({ query: { token: "not-a-real-token" } })
      .then(() => 200)
      .catch((e: { statusCode?: number }) => e.statusCode);
    expect(bad).toBeGreaterThanOrEqual(400);
  });

  it("rejects short passwords", async () => {
    const res = await auth.api.signUpEmail({
      body: { name: "Short", email: "short@example.test", password: "short" },
      asResponse: true,
    });
    expect(res.status).toBe(400);
  });
});
