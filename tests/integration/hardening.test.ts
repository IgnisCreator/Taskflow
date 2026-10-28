import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { callAs, cleanupTestData } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

const run = promisify(execFile);
const { db } = await import("@/server/db");
const { auth } = await import("@/server/auth");
const { clientAddress, purgeRateLimits, rateLimit, WRITE_LIMIT } =
  await import("@/server/rate-limit");
const health = await import("@/app/api/health/route");
const readRoute = await import("@/app/api/notifications/read/route");

const BASE = "http://localhost:3000";
const OK = { origin: BASE, "content-type": "application/json" };

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(async () => {
  await db.apiRateLimit.deleteMany({ where: { key: { startsWith: "test:" } } });
  await db.apiRateLimit.deleteMany({
    where: { key: { startsWith: "write:198.51.100." } },
  });
  await db.rateLimit.deleteMany({ where: { key: { contains: "203.0.113." } } });
  await cleanupTestData();
});

describe("the rate limiter", () => {
  const rule = { limit: 3, windowSeconds: 60 };
  const T0 = Date.parse("2026-11-01T10:00:10Z");

  it("allows the limit and refuses what comes after, saying when to come back", async () => {
    const key = `test:basic:${crypto.randomUUID()}`;
    const results = [];
    for (let i = 0; i < 5; i++) results.push(await rateLimit(key, rule, T0));
    expect(results.map((r) => r.ok)).toEqual([true, true, true, false, false]);
    // The window is the minute 10:00; at 10:00:10 there are 50 seconds left.
    expect(results[3]!.retryAfter).toBe(50);
  });

  it("starts again in the next window", async () => {
    const key = `test:window:${crypto.randomUUID()}`;
    for (let i = 0; i < 4; i++) await rateLimit(key, rule, T0);
    expect((await rateLimit(key, rule, T0)).ok).toBe(false);
    expect((await rateLimit(key, rule, T0 + 60_000)).ok).toBe(true);
  });

  it("counts every key on its own", async () => {
    const a = `test:a:${crypto.randomUUID()}`;
    const b = `test:b:${crypto.randomUUID()}`;
    for (let i = 0; i < 4; i++) await rateLimit(a, rule, T0);
    expect((await rateLimit(a, rule, T0)).ok).toBe(false);
    expect((await rateLimit(b, rule, T0)).ok).toBe(true);
  });

  it("is atomic: thirty requests at once let exactly the limit through", async () => {
    const key = `test:race:${crypto.randomUUID()}`;
    const results = await Promise.all(
      Array.from({ length: 30 }, () =>
        rateLimit(key, { limit: 10, windowSeconds: 60 }, T0),
      ),
    );
    expect(results.filter((r) => r.ok)).toHaveLength(10);
  });

  it("purges only what has expired", async () => {
    const old = `test:old:${crypto.randomUUID()}`;
    const fresh = `test:fresh:${crypto.randomUUID()}`;
    await rateLimit(old, rule, T0);
    await rateLimit(fresh, rule, T0 + 3 * 3_600_000);
    const purged = await purgeRateLimits(T0 + 3_600_000);
    expect(purged.api).toBeGreaterThanOrEqual(1);
    expect(await db.apiRateLimit.count({ where: { key: old } })).toBe(0);
    expect(await db.apiRateLimit.count({ where: { key: fresh } })).toBe(1);
  });

  it("reads the client address the way the platform reports it", () => {
    const headers = (init: Record<string, string>) => new Headers(init);
    expect(
      clientAddress(headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" })),
    ).toBe("203.0.113.9");
    expect(clientAddress(headers({ "x-real-ip": "198.51.100.4" }))).toBe(
      "198.51.100.4",
    );
    expect(clientAddress(headers({}))).toBeNull();
    expect(
      clientAddress(headers({ "x-forwarded-for": "x".repeat(65) })),
    ).toBeNull();
  });
});

describe("writes to the API are counted per address", () => {
  const write = (address?: string) =>
    callAs(
      world.owner,
      readRoute.POST,
      new Request(`${BASE}/api/notifications/read`, {
        method: "POST",
        headers: { ...OK, ...(address ? { "x-forwarded-for": address } : {}) },
        body: "{}",
      }),
    );

  it("refuses with a 429 and Retry-After after the limit, and one address does not hurt another", async () => {
    const address = "198.51.100.10";
    for (let i = 0; i < WRITE_LIMIT.limit; i++) {
      expect((await write(address)).status).toBe(204);
    }
    const blocked = await write(address);
    expect(blocked.status).toBe(429);
    expect((await blocked.json()).error.code).toBe("RATE_LIMITED");
    const wait = Number(blocked.headers.get("retry-after"));
    expect(wait).toBeGreaterThanOrEqual(1);
    expect(wait).toBeLessThanOrEqual(WRITE_LIMIT.windowSeconds);
    expect((await write("198.51.100.11")).status).toBe(204);
  });

  it("does not count reads, and does not count what has no address", async () => {
    const address = "198.51.100.12";
    for (let i = 0; i < WRITE_LIMIT.limit + 5; i++) {
      const res = await callAs(
        world.owner,
        (await import("@/app/api/notifications/route")).GET,
        new Request(`${BASE}/api/notifications`, {
          headers: { "x-forwarded-for": address },
        }),
      );
      expect(res.status).toBe(200);
    }
    for (let i = 0; i < 3; i++) expect((await write()).status).toBe(204);
    expect(
      await db.apiRateLimit.count({
        where: { key: { in: [`write:${address}`] } },
      }),
    ).toBe(0);
  });
});

describe("/api/health", () => {
  it("says ok when the database answers, and nothing else", async () => {
    const res = await health.GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["status", "time"]);
    expect(body.status).toBe("ok");
    expect(res.headers.get("cache-control")).toContain("no-store");
  });

  it("is a bare 503 when the database does not, with no error details", async () => {
    const spy = vi
      .spyOn(db, "$queryRaw")
      .mockRejectedValue(new Error("connect ECONNREFUSED 10.1.2.3:5432"));
    const res = await health.GET();
    spy.mockRestore();
    expect(res.status).toBe(503);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ status: "unavailable" });
    expect(text).not.toContain("ECONNREFUSED");
  });
});

describe("Better Auth counts sign-in attempts in the database", () => {
  it("answers 429 after ten attempts from one address, and the counter is a table row", async () => {
    const attempt = () =>
      auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { ...OK, "x-forwarded-for": "203.0.113.77" },
          body: JSON.stringify({
            email: "nobody@example.test",
            password: "wrong-password-123",
          }),
        }),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 12; i++) statuses.push((await attempt()).status);
    expect(statuses.slice(0, 10).every((s) => s !== 429)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
    expect(
      await db.rateLimit.count({
        where: { key: { contains: "203.0.113.77" } },
      }),
    ).toBeGreaterThan(0);
  });
});

describe("the closed deployment", () => {
  it("has no public sign-up and no GitHub login", async () => {
    vi.resetModules();
    process.env.OPEN_ACCESS = "";
    try {
      const closed = (await import("@/server/auth")).auth;
      await expect(
        closed.api.signUpEmail({
          body: {
            name: "Intruder",
            email: "intruder@example.test",
            password: "a-long-password-1",
          },
        }),
      ).rejects.toThrow();
      expect(
        await db.user.count({ where: { email: "intruder@example.test" } }),
      ).toBe(0);
      const social = closed.options.socialProviders as Record<string, unknown>;
      expect(Object.keys(social ?? {})).toEqual([]);
      const env = await import("@/lib/env");
      expect(env.openAccess()).toBe(false);
      expect(env.githubLogin()).toBe(false);
    } finally {
      process.env.OPEN_ACCESS = "1";
      vi.resetModules();
    }
  });

  it("the open one (development) still has both", async () => {
    const env = await import("@/lib/env");
    expect(env.openAccess()).toBe(true);
    expect(env.githubLogin()).toBe(true);
    expect(Object.keys(auth.options.socialProviders ?? {})).toEqual(["github"]);
  });
});

describe("npm run user:create", () => {
  const create = (args: string[], password = "a-long-password-1") =>
    run(process.execPath, ["scripts/user-create.mjs", ...args], {
      env: { ...process.env, USER_PASSWORD: password },
    }).then(
      ({ stdout, stderr }) => ({ code: 0, out: stdout + stderr }),
      (error: { code: number; stdout: string; stderr: string }) => ({
        code: error.code,
        out: error.stdout + error.stderr,
      }),
    );
  const email = () => `made-${crypto.randomUUID().slice(0, 8)}@example.test`;

  it("makes a verified user who can sign in with the password, and never prints it", async () => {
    const address = email();
    const result = await create([
      "--email",
      address,
      "--name",
      "Made By Script",
    ]);
    expect(result.code).toBe(0);
    expect(result.out).toContain(address);
    expect(result.out).not.toContain("a-long-password-1");
    const user = await db.user.findUniqueOrThrow({ where: { email: address } });
    expect(user).toMatchObject({
      name: "Made By Script",
      emailVerified: true,
      digestEmail: false,
      isDemo: false,
    });
    const signedIn = await auth.api.signInEmail({
      body: { email: address, password: "a-long-password-1" },
    });
    expect(signedIn.user.id).toBe(user.id);
    await expect(
      auth.api.signInEmail({
        body: { email: address, password: "another-password-2" },
      }),
    ).rejects.toThrow();
    const account = await db.account.findFirstOrThrow({
      where: { userId: user.id },
    });
    expect(account.password).not.toContain("a-long-password-1");
  });

  it("asks for the daily email only when told to, and can add the person to a workspace", async () => {
    const fixture = await createListFor(world);
    const address = email();
    const result = await create([
      "--email",
      address,
      "--name",
      "Digest Person",
      "--digest",
      "--workspace",
      fixture.workspaceId,
      "--role",
      "GUEST",
    ]);
    expect(result.code).toBe(0);
    const user = await db.user.findUniqueOrThrow({ where: { email: address } });
    expect(user.digestEmail).toBe(true);
    const member = await db.workspaceMember.findUniqueOrThrow({
      where: {
        workspaceId_userId: {
          workspaceId: fixture.workspaceId,
          userId: user.id,
        },
      },
    });
    expect(member.role).toBe("GUEST");
  });

  it("refuses bad input and leaves nothing behind", async () => {
    const fixture = await createListFor(world);
    const good = ["--name", "Someone"];
    const before = await db.user.count();
    const attempts: [string[], string?][] = [
      [["--email", "not-an-email", ...good]],
      [["--email", email()]], // no name
      [["--email", email(), ...good], "short"], // weak password
      [
        [
          "--email",
          email(),
          ...good,
          "--role",
          "OWNER",
          "--workspace",
          fixture.workspaceId,
        ],
      ],
      [["--email", email(), ...good, "--workspace", "no-such-workspace"]],
    ];
    for (const [args, password] of attempts) {
      const result = await create(args, password);
      expect(result.code, args.join(" ")).toBe(1);
      expect(result.out).toContain("user:create:");
    }
    expect(await db.user.count()).toBe(before);
  });

  it("refuses an email that exists, and a workspace that is full", async () => {
    const address = email();
    expect((await create(["--email", address, "--name", "First"])).code).toBe(
      0,
    );
    const again = await create([
      "--email",
      address.toUpperCase(),
      "--name",
      "Second",
    ]);
    expect(again.code).toBe(1);
    expect(again.out).toContain("already a user");

    const fixture = await createListFor(world);
    // The fixture has 4 people; fill it up to 20.
    const filler = await Promise.all(
      Array.from({ length: 16 }, (_, i) =>
        db.user.create({
          data: {
            id: crypto.randomUUID(),
            name: `Filler ${i}`,
            email: email(),
          },
        }),
      ),
    );
    await db.workspaceMember.createMany({
      data: filler.map((u) => ({
        workspaceId: fixture.workspaceId,
        userId: u.id,
        role: "MEMBER" as const,
      })),
    });
    const full = await create([
      "--email",
      email(),
      "--name",
      "One too many",
      "--workspace",
      fixture.workspaceId,
    ]);
    expect(full.code).toBe(1);
    expect(full.out).toContain("20 people");
  });
});
