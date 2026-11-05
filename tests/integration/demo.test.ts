import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestData, callAs, type Actor } from "../helpers/actors";
import { setRequestHeaders } from "../helpers/request-context";
import { testAuth } from "../helpers/test-auth";
import {
  createListFor,
  createWorld,
  snapshot,
  type World,
} from "../helpers/world";

const { db } = await import("@/server/db");
const { auth } = await import("@/server/auth");
const demo = await import("@/server/services/demo");
const { generateDemo, DEMO_PEOPLE } = await import("@/lib/demo-data");
const { runAlerts } = await import("@/server/services/alerts");
const { listNotifications } = await import("@/server/services/notifications");
const { getListMetrics } = await import("@/server/services/metrics");
const { getListForecast } = await import("@/server/services/forecast");
const { parseForecastQuery } = await import("@/lib/validations/forecast");
const { getWorkspace } = await import("@/server/services/workspaces");
const { createTask, moveTask } = await import("@/server/services/tasks");
const { createComment } = await import("@/server/services/details");
const { createList } = await import("@/server/services/lists");
const { createSpace } = await import("@/server/services/spaces");
const { addMember } = await import("@/server/services/members");
const { rateLimit, DEMO_LIMIT } = await import("@/server/rate-limit");
const workspacesRoute = await import("@/app/api/workspaces/route");
const meRoute = await import("@/app/api/me/route");
const readRoute = await import("@/app/api/notifications/read/route");
const tasksRoute = await import("@/app/api/lists/[listId]/tasks/route");
const cronRoute = await import("@/app/api/cron/alerts/route");
const actions = await import("@/app/demo-actions");

const BASE = "http://localhost:3000";
const OK = { origin: BASE, "content-type": "application/json" };
const req = (method: string, path: string, body?: object) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: OK,
    body: body ? JSON.stringify(body) : undefined,
  });
const HOUR = 3_600_000;
const newList = { folderId: null, templateId: null, description: null };
// Real time: the 24 hours are enforced against the clock, so a sandbox made "in the past" is over.
const NOW = Date.now();

async function wipeSandboxes() {
  await db.workspace.deleteMany({
    where: { members: { some: { user: { sandboxUntil: { not: null } } } } },
  });
  await db.user.deleteMany({ where: { sandboxUntil: { not: null } } });
  await db.apiRateLimit.deleteMany({ where: { key: { startsWith: "demo:" } } });
}
async function sessionOf(userId: string): Promise<Actor> {
  const ctx = await testAuth.$context;
  const headers = await ctx.test.getAuthHeaders({ userId });
  return { id: userId, email: "", cookie: headers.get("cookie") ?? "" };
}
/** Where a server action sent the caller (a redirect is an error with a digest). */
async function redirectOf(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    const digest = (error as { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT")) return digest.split(";")[2]!;
    throw error;
  }
  throw new Error("the action did not redirect");
}

type Sandbox = Awaited<ReturnType<typeof demo.createSandbox>>;
let world: World;
let a: Sandbox;
let b: Sandbox;
let visitor: Actor;
let listId: string;
let columnIds: string[];

beforeAll(async () => {
  await cleanupTestData();
  await wipeSandboxes();
  world = await createWorld();
  a = await demo.createSandbox(NOW);
  b = await demo.createSandbox(NOW);
  visitor = await sessionOf(a.userId);
  const list = await db.list.findFirstOrThrow({
    where: { space: { workspaceId: a.workspaceId }, name: "Platform" },
    include: { columns: { orderBy: { position: "asc" } } },
  });
  listId = list.id;
  columnIds = list.columns.map((c) => c.id);
}, 120_000);
afterAll(async () => {
  await wipeSandboxes();
  await cleanupTestData();
  delete process.env.DEMO_ENABLED;
});

describe("a sandbox", () => {
  it("is the visitor's own copy of the sample workspace, with their 24 hours", async () => {
    const lists = generateDemo(Math.floor(NOW / 86_400_000) * 86_400_000);
    expect(a.tasks).toBe(lists.reduce((n, l) => n + l.tasks.length, 0));
    expect(a.events).toBe(
      lists.reduce(
        (n, l) => n + l.tasks.reduce((m, t) => m + t.events.length, 0),
        0,
      ),
    );
    const user = await db.user.findUniqueOrThrow({ where: { id: a.userId } });
    expect(user.sandboxUntil!.getTime()).toBe(NOW + 24 * HOUR);
    expect(user.isDemo).toBe(false);
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: a.workspaceId },
      include: { spaces: true },
    });
    expect(workspace.spaces.map((s) => s.name).sort()).toEqual([
      "Software",
      "Support",
    ]);
    // Every task sits in the stage its last event says.
    const rows = await db.task.findMany({
      where: { list: { space: { workspaceId: a.workspaceId } } },
      select: {
        column: { select: { name: true } },
        events: {
          orderBy: [{ at: "desc" }, { id: "desc" }],
          take: 1,
          select: { toStage: { select: { name: true } } },
        },
      },
    });
    expect(rows).toHaveLength(a.tasks);
    expect(
      rows.every((r) => r.column.name === r.events[0]!.toStage!.name),
    ).toBe(true);
  });

  it("has every role: the visitor owns it, made-up people hold the others", async () => {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: a.workspaceId },
      include: { user: true },
    });
    expect(members).toHaveLength(DEMO_PEOPLE.length + 1);
    expect(new Set(members.map((m) => m.role))).toEqual(
      new Set(["OWNER", "ADMIN", "MEMBER", "GUEST"]),
    );
    const owners = members.filter((m) => m.role === "OWNER");
    expect(owners.map((m) => m.userId)).toEqual([a.userId]);
    // The teammates are made up and cannot sign in; only the visitor has a (derived) password.
    expect(
      members.filter((m) => m.userId !== a.userId).every((m) => m.user.isDemo),
    ).toBe(true);
    const credentials = await db.account.findMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        providerId: "credential",
      },
    });
    expect(credentials.map((c) => c.userId)).toEqual([a.userId]);
    expect(credentials[0]!.password).not.toContain(a.password);
    const ok = await auth.api.signInEmail({
      body: { email: a.email, password: a.password },
    });
    expect(ok.user.email).toBe(a.email);
    await expect(
      auth.api.signInEmail({
        body: { email: a.email, password: "wrong-password-123" },
      }),
    ).rejects.toThrow();
  });

  it("shows the guest only the space they are listed in, and the owner everything", async () => {
    const guest = DEMO_PEOPLE.findIndex((p) => p.role === "GUEST");
    const guestId = (
      await db.user.findFirstOrThrow({
        where: { name: DEMO_PEOPLE[guest]!.name, isDemo: true },
      })
    ).id;
    const seen = await getWorkspace(guestId, a.workspaceId);
    expect(seen.role).toBe("GUEST");
    expect(seen.spaces.map((s) => s.name)).toEqual(["Support"]);
    const owner = await getWorkspace(a.userId, a.workspaceId);
    expect(owner.role).toBe("OWNER");
    expect(owner.spaces.map((s) => s.name).sort()).toEqual([
      "Software",
      "Support",
    ]);
  });

  it("reads the metrics and the forecast with enough history", async () => {
    const day = NOW - (NOW % 86_400_000);
    const metrics = await getListMetrics(
      a.userId,
      listId,
      { from: day - 89 * 86_400_000, to: day },
      NOW,
    );
    expect(metrics.throughput.total).toBeGreaterThan(20);
    const forecast = await getListForecast(
      a.userId,
      listId,
      parseForecastQuery({}, NOW),
      NOW,
    );
    expect(forecast.possible).toBe(true);
    expect(forecast.warnings).toEqual([]);
  });

  it("raises the alerts of its lists once, for the owner and the admins, and for no real person", async () => {
    const mine = (await listNotifications(a.userId)).open.filter(
      (n) => n.listName === "Platform",
    );
    expect(
      mine.some((n) =>
        n.message.includes('"Code review" has been over its WIP limit'),
      ),
    ).toBe(true);
    const admin = await db.user.findFirstOrThrow({
      where: { name: "Marco Silva", isDemo: true },
    });
    expect(
      (await listNotifications(admin.id)).open.some(
        (n) => n.listName === "Platform",
      ),
    ).toBe(true);
    expect(
      await db.notification.count({
        where: {
          list: { space: { workspaceId: a.workspaceId } },
          user: { isDemo: false, sandboxUntil: null },
        },
      }),
    ).toBe(0);
    // The daily job leaves sandboxes alone; asking for the workspace checks it.
    await db.notification.deleteMany({
      where: { list: { space: { workspaceId: b.workspaceId } } },
    });
    await runAlerts(NOW);
    expect(
      await db.notification.count({
        where: { list: { space: { workspaceId: b.workspaceId } } },
      }),
    ).toBe(0);
    await runAlerts(NOW, b.workspaceId);
    expect(
      await db.notification.count({
        where: { list: { space: { workspaceId: b.workspaceId } } },
      }),
    ).toBeGreaterThan(0);
  });
});

describe("what the visitor can do in it", () => {
  it("everything an owner can: create and move a task, comment, make a list and a space", async () => {
    const version = (await db.list.findUniqueOrThrow({ where: { id: listId } }))
      .boardVersion;
    const create = await callAs(
      visitor,
      tasksRoute.POST,
      req("POST", `/api/lists/${listId}/tasks`, {
        id: crypto.randomUUID(),
        columnId: columnIds[0],
        title: "My own task",
        expectedBoardVersion: version,
      }),
      { listId },
    );
    expect(create.status).toBe(201);
    const { task, boardVersion } = await create.json();
    await moveTask(a.userId, listId, task.id, {
      columnId: columnIds[1]!,
      toIndex: 0,
      expectedBoardVersion: boardVersion,
    });
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: task.id } })).columnId,
    ).toBe(columnIds[1]);
    await expect(
      createComment(a.userId, listId, task.id, "Looks good"),
    ).resolves.toBeDefined();
    const space = await createSpace(a.userId, a.workspaceId, {
      name: "Mine",
      isPrivate: false,
    });
    await expect(
      createList(a.userId, { ...newList, spaceId: space.id, name: "My list" }),
    ).resolves.toBeDefined();
  });

  it("can mark the alerts as read: they are their own", async () => {
    const res = await callAs(
      visitor,
      readRoute.POST,
      req("POST", "/api/notifications/read", {}),
    );
    expect(res.status).toBe(204);
  });

  it("cannot touch the account, make another workspace or look people up by email", async () => {
    const preference = await callAs(
      visitor,
      meRoute.PATCH,
      req("PATCH", "/api/me", { digestEmail: true }),
    );
    expect(preference.status).toBe(403);
    expect((await preference.json()).error.code).toBe("DEMO_RESTRICTED");
    const another = await callAs(
      visitor,
      workspacesRoute.POST,
      req("POST", "/api/workspaces", { name: "Mine" }),
    );
    expect(another.status).toBe(403);
    await expect(
      addMember(a.userId, a.workspaceId, {
        email: world.candidate.email,
        role: "MEMBER",
      }),
    ).rejects.toMatchObject({ status: 403, code: "DEMO_RESTRICTED" });
    expect(
      await db.workspaceMember.count({
        where: {
          workspaceId: a.workspaceId,
          user: { email: world.candidate.email },
        },
      }),
    ).toBe(0);

    const headers = new Headers({ cookie: visitor.cookie });
    await expect(
      auth.api.updateUser({ headers, body: { name: "Not the visitor" } }),
    ).rejects.toThrow(/not available in the demo/);
    await expect(
      auth.api.changePassword({
        headers,
        body: {
          currentPassword: a.password,
          newPassword: "another-long-password",
        },
      }),
    ).rejects.toThrow(/not available in the demo/);
    await expect(auth.api.listSessions({ headers })).rejects.toThrow(
      /not available in the demo/,
    );
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: a.userId } })).name,
    ).toBe("Demo visitor");
  });

  it("a normal user is not affected by those guards (control)", async () => {
    const headers = new Headers({ cookie: world.member.cookie });
    await expect(
      auth.api.updateUser({ headers, body: { name: "Renamed member" } }),
    ).resolves.toBeDefined();
    expect(
      (
        await callAs(
          world.member,
          meRoute.PATCH,
          req("PATCH", "/api/me", { digestEmail: true }),
        )
      ).status,
    ).toBe(200);
    await expect(
      auth.api.listSessions({
        headers: new Headers({ cookie: world.member.cookie }),
      }),
    ).resolves.toBeDefined();
  });
});

describe("sandboxes are separate", () => {
  it("one visitor cannot read or write in another's workspace", async () => {
    const other = await sessionOf(b.userId);
    await expect(getWorkspace(b.userId, a.workspaceId)).rejects.toMatchObject({
      status: 404,
    });
    const res = await callAs(
      other,
      tasksRoute.POST,
      req("POST", `/api/lists/${listId}/tasks`, {
        id: crypto.randomUUID(),
        columnId: columnIds[0],
        title: "Intruder",
        expectedBoardVersion: 1,
      }),
      { listId },
    );
    expect(res.status).toBe(404);
    expect(await db.task.count({ where: { title: "Intruder" } })).toBe(0);
  });

  it("the made-up teammates are shared, but nobody can be added to a real workspace", async () => {
    const { workspaceId } = await createListFor(world);
    for (const email of [a.email, "dana@demo.taskflow.test"]) {
      await expect(
        addMember(world.owner.id, workspaceId, { email, role: "MEMBER" }),
      ).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND" });
    }
    // A real user is still added (control).
    await expect(
      addMember(world.owner.id, workspaceId, {
        email: world.candidate.email,
        role: "MEMBER",
      }),
    ).resolves.toBeDefined();
  });
});

describe("the 24 hours", () => {
  it("a sandbox past its deadline is signed out, even before anything deleted it", async () => {
    const old = await demo.createSandbox(NOW - 25 * HOUR);
    const session = await sessionOf(old.userId);
    const res = await callAs(session, meRoute.GET, req("GET", "/api/me"));
    expect(res.status).toBe(401);
    // The live one is signed in (control).
    expect(
      (await callAs(visitor, meRoute.GET, req("GET", "/api/me"))).status,
    ).toBe(200);
  });

  it("the purge deletes the finished sandboxes with their data and nothing else", async () => {
    const fixture = await createListFor(world);
    const before = await snapshot(fixture.workspaceId);
    const real = await db.user.count({
      where: { sandboxUntil: null, isDemo: false },
    });
    const teammates = await db.user.count({ where: { isDemo: true } });
    const expired = await db.user.findMany({
      where: { sandboxUntil: { lt: new Date(NOW) } },
      select: { id: true },
    });
    expect(expired).toHaveLength(1);
    const oldWorkspace = await db.workspaceMember.findFirstOrThrow({
      where: { userId: expired[0]!.id },
    });
    // With a small limit it does only that much; the live ones are never selected.
    expect(await demo.purgeSandboxes(NOW, 1)).toBe(1);
    expect(await demo.purgeSandboxes(NOW)).toBe(0);
    expect(await db.user.count({ where: { id: expired[0]!.id } })).toBe(0);
    expect(
      await db.workspace.count({ where: { id: oldWorkspace.workspaceId } }),
    ).toBe(0);
    expect(
      await db.task.count({
        where: { list: { space: { workspaceId: oldWorkspace.workspaceId } } },
      }),
    ).toBe(0);
    expect(
      await db.workspace.count({
        where: { id: { in: [a.workspaceId, b.workspaceId] } },
      }),
    ).toBe(2);
    expect(await snapshot(fixture.workspaceId)).toEqual(before);
    expect(
      await db.user.count({ where: { sandboxUntil: null, isDemo: false } }),
    ).toBe(real);
    expect(await db.user.count({ where: { isDemo: true } })).toBe(teammates);
  });

  it("the daily job runs the purge and still runs the alerts", async () => {
    process.env.CRON_SECRET = "a-secret-for-the-demo-test";
    const old = await demo.createSandbox(NOW - 25 * HOUR);
    const res = await cronRoute.GET(
      new Request(`${BASE}/api/cron/alerts`, {
        headers: { authorization: "Bearer a-secret-for-the-demo-test" },
      }),
    );
    const body = await res.json();
    expect(body.demo).toEqual({ purged: 1 });
    expect(body.alerts.failed).toBe(0);
    expect(await db.user.count({ where: { id: old.userId } })).toBe(0);
  });
});

describe("restarting and leaving", () => {
  it("restart gives fresh sample data in a new workspace and keeps the deadline", async () => {
    const c = await demo.createSandbox(NOW);
    await db.task.deleteMany({
      where: { list: { space: { workspaceId: c.workspaceId } } },
    });
    const built = await demo.restartSandbox(c.userId, NOW);
    expect(built!.workspaceId).not.toBe(c.workspaceId);
    expect(built!.tasks).toBe(c.tasks);
    expect(await db.workspace.count({ where: { id: c.workspaceId } })).toBe(0);
    expect(
      await db.workspaceMember.count({
        where: { userId: c.userId, role: "OWNER" },
      }),
    ).toBe(1);
    const user = await db.user.findUniqueOrThrow({ where: { id: c.userId } });
    expect(user.sandboxUntil!.getTime()).toBe(NOW + 24 * HOUR);
    // After the deadline there is nothing to restart.
    expect(await demo.restartSandbox(c.userId, NOW + 25 * HOUR)).toBeNull();
    await demo.leaveSandbox(c.userId);
  });

  it("leaving deletes the sandbox now, and only ever a sandbox", async () => {
    const c = await demo.createSandbox(NOW);
    expect(await demo.leaveSandbox(c.userId)).toBe(1);
    expect(await db.user.count({ where: { id: c.userId } })).toBe(0);
    expect(await db.workspace.count({ where: { id: c.workspaceId } })).toBe(0);
    // A real user and a made-up teammate are not touched (control).
    expect(await demo.leaveSandbox(world.owner.id)).toBe(0);
    expect(await demo.leaveSandbox("demo-dana")).toBe(0);
    expect(await db.user.count({ where: { id: world.owner.id } })).toBe(1);
  });
});

describe("the limits of a sandbox", () => {
  it("refuses a task, a comment, a space and a list past the caps, and only in a sandbox", async () => {
    const { SANDBOX_CAPS } = await import("@/server/sandbox");
    const c = await demo.createSandbox(NOW);
    const list = await db.list.findFirstOrThrow({
      where: { space: { workspaceId: c.workspaceId }, name: "Platform" },
      include: { columns: true },
    });
    const column = list.columns[0]!;
    const some = await db.task.findFirstOrThrow({ where: { listId: list.id } });
    const full = { status: 409, code: "LIMIT_REACHED" };

    const tasks = await db.task.count({
      where: { list: { space: { workspaceId: c.workspaceId } } },
    });
    await db.task.createMany({
      data: Array.from({ length: SANDBOX_CAPS.tasks - tasks }, (_, i) => ({
        id: crypto.randomUUID(),
        listId: list.id,
        columnId: column.id,
        title: `Filler ${i}`,
        position: 1000 + i,
        createdById: c.userId,
      })),
    });
    const version = (
      await db.list.findUniqueOrThrow({ where: { id: list.id } })
    ).boardVersion;
    await expect(
      createTask(c.userId, list.id, {
        id: crypto.randomUUID(),
        columnId: column.id,
        title: "One too many",
        description: null,
        priority: "MEDIUM",
        assigneeIds: [],
        typeId: null,
        labelIds: [],
        dueDate: null,
        expectedBoardVersion: version,
      }),
    ).rejects.toMatchObject(full);

    await db.comment.createMany({
      data: Array.from({ length: SANDBOX_CAPS.comments }, () => ({
        taskId: some.id,
        authorId: c.userId,
        body: "filler",
      })),
    });
    await expect(
      createComment(c.userId, list.id, some.id, "Too many"),
    ).rejects.toMatchObject(full);

    const spaces = await db.space.count({
      where: { workspaceId: c.workspaceId },
    });
    await db.space.createMany({
      data: Array.from({ length: SANDBOX_CAPS.spaces - spaces }, (_, i) => ({
        workspaceId: c.workspaceId,
        name: `Filler ${i}`,
      })),
    });
    await expect(
      createSpace(c.userId, c.workspaceId, {
        name: "Too many",
        isPrivate: false,
      }),
    ).rejects.toMatchObject(full);

    const space = await db.space.findFirstOrThrow({
      where: { workspaceId: c.workspaceId },
    });
    const lists = await db.list.count({
      where: { space: { workspaceId: c.workspaceId } },
    });
    await db.list.createMany({
      data: Array.from({ length: SANDBOX_CAPS.lists - lists }, (_, i) => ({
        spaceId: space.id,
        name: `Filler ${i}`,
      })),
    });
    await expect(
      createList(c.userId, { ...newList, spaceId: space.id, name: "Too many" }),
    ).rejects.toMatchObject(full);

    // A real workspace has no such cap (control): six spaces are fine.
    const real = await createListFor(world);
    await db.space.createMany({
      data: Array.from({ length: SANDBOX_CAPS.spaces + 1 }, (_, i) => ({
        workspaceId: real.workspaceId,
        name: `Real ${i}`,
      })),
    });
    await expect(
      createSpace(world.owner.id, real.workspaceId, {
        name: "Fine",
        isPrivate: false,
      }),
    ).resolves.toBeDefined();
    await demo.leaveSandbox(c.userId);
  }, 60_000);
});

describe("the entry", () => {
  it("is a 404 unless the deployment turns the demo on", async () => {
    delete process.env.DEMO_ENABLED;
    expect(demo.demoEnabled()).toBe(false);
    await expect(actions.startDemo()).rejects.toThrow();
    await expect(actions.restartDemo()).rejects.toThrow();
  });

  it("never replaces a session that exists: a real user goes to their workspaces, a visitor back to their sandbox", async () => {
    process.env.DEMO_ENABLED = "1";
    setRequestHeaders(new Headers({ cookie: world.member.cookie }));
    expect(await redirectOf(actions.startDemo)).toBe("/workspaces");
    setRequestHeaders(new Headers({ cookie: visitor.cookie }));
    expect(await redirectOf(actions.startDemo)).toBe(`/w/${a.workspaceId}`);
    // Restart is for sandbox visitors only.
    setRequestHeaders(new Headers({ cookie: world.member.cookie }));
    expect(await redirectOf(actions.restartDemo)).toBe("/");
  });

  it("asks a visitor to come back later when the sandboxes are full, and counts entries per address", async () => {
    process.env.DEMO_ENABLED = "1";
    setRequestHeaders(new Headers({ "x-forwarded-for": "203.0.113.9" }));
    for (let i = 0; i < DEMO_LIMIT.limit; i++) {
      await rateLimit("demo:203.0.113.9", DEMO_LIMIT);
    }
    expect(await redirectOf(actions.startDemo)).toBe("/?demo=limit");

    setRequestHeaders(new Headers({ "x-forwarded-for": "203.0.113.10" }));
    const alive = await demo.aliveSandboxes();
    await db.user.createMany({
      data: Array.from({ length: demo.MAX_SANDBOXES - alive }, (_, i) => ({
        id: `sandbox-filler-${i}`,
        name: "Filler",
        email: `filler-${i}@demo.taskflow.test`,
        sandboxUntil: new Date(NOW + HOUR),
      })),
    });
    expect(await redirectOf(actions.startDemo)).toBe("/?demo=busy");
    await db.user.deleteMany({
      where: { id: { startsWith: "sandbox-filler-" } },
    });
  });
});
