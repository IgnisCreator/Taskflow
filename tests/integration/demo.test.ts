import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestData, callAs, type Actor } from "../helpers/actors";
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
const { generateDemo } = await import("@/lib/demo-data");
const { runAlerts } = await import("@/server/services/alerts");
const { listNotifications } = await import("@/server/services/notifications");
const { getListMetrics } = await import("@/server/services/metrics");
const { getListForecast } = await import("@/server/services/forecast");
const { parseForecastQuery } = await import("@/lib/validations/forecast");
const { getWorkspace } = await import("@/server/services/workspaces");
const workspacesRoute = await import("@/app/api/workspaces/route");
const meRoute = await import("@/app/api/me/route");
const readRoute = await import("@/app/api/notifications/read/route");
const listRoute = await import("@/app/api/lists/[listId]/route");
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

// Late October 2026; the history ends the day before.
const NOW = Date.parse("2026-10-28T12:00:00Z");

async function wipeDemo() {
  await db.workspace.deleteMany({ where: { isDemo: true } });
  await db.user.deleteMany({ where: { isDemo: true } });
}
async function sessionOf(userId: string): Promise<Actor> {
  const ctx = await testAuth.$context;
  const headers = await ctx.test.getAuthHeaders({ userId });
  return { id: userId, email: "", cookie: headers.get("cookie") ?? "" };
}

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  await wipeDemo();
  world = await createWorld();
});
afterAll(async () => {
  await wipeDemo();
  await cleanupTestData();
  delete process.env.DEMO_ENABLED;
});

describe("regenerating the sample workspace", () => {
  let first: Awaited<ReturnType<typeof demo.regenerateDemo>>;
  beforeAll(async () => {
    first = await demo.regenerateDemo(NOW);
  });

  it("writes the lists, tasks and histories the generator made, marked as the demo", async () => {
    const lists = generateDemo(Math.floor(NOW / 86_400_000) * 86_400_000);
    expect(first.tasks).toBe(lists.reduce((n, l) => n + l.tasks.length, 0));
    expect(first.events).toBe(
      lists.reduce(
        (n, l) => n + l.tasks.reduce((m, t) => m + t.events.length, 0),
        0,
      ),
    );
    const workspace = await db.workspace.findUniqueOrThrow({
      where: { id: first.workspaceId },
      include: {
        spaces: { include: { lists: { include: { columns: true } } } },
      },
    });
    expect(workspace.isDemo).toBe(true);
    expect(workspace.spaces.map((s) => s.name).sort()).toEqual([
      "Software",
      "Support",
    ]);
    const platform = workspace.spaces
      .flatMap((s) => s.lists)
      .find((l) => l.name === "Platform")!;
    expect(
      platform.columns.find((c) => c.name === "Code review")!.wipLimit,
    ).toBe(3);
    expect(
      await db.task.count({
        where: { list: { space: { workspaceId: workspace.id } } },
      }),
    ).toBe(first.tasks);
    // Every task sits in the stage its last event says.
    const rows = await db.task.findMany({
      where: { list: { space: { workspaceId: workspace.id } } },
      select: {
        column: { select: { name: true } },
        events: {
          orderBy: [{ at: "desc" }, { id: "desc" }],
          take: 1,
          select: { toStage: { select: { name: true } } },
        },
      },
    });
    expect(rows).toHaveLength(first.tasks);
    expect(
      rows.every((r) => r.column.name === r.events[0]!.toStage!.name),
    ).toBe(true);
  });

  it("only made-up people and the visitor are in it, and only the visitor can sign in", async () => {
    const members = await db.workspaceMember.findMany({
      where: { workspaceId: first.workspaceId },
      include: { user: true },
    });
    expect(members).toHaveLength(6);
    expect(members.every((m) => m.user.isDemo)).toBe(true);
    expect(
      members.filter((m) => m.role === "GUEST").map((m) => m.user.email),
    ).toEqual([demo.DEMO_VISITOR_EMAIL]);
    const credentials = await db.account.findMany({
      where: {
        userId: { in: members.map((m) => m.userId) },
        providerId: "credential",
      },
    });
    expect(credentials.map((c) => c.userId)).toEqual([
      members.find((m) => m.role === "GUEST")!.userId,
    ]);
    // The derived password works, a wrong one does not, and it is not stored in clear.
    const ok = await auth.api.signInEmail({
      body: { email: demo.DEMO_VISITOR_EMAIL, password: demo.demoPassword() },
    });
    expect(ok.user.email).toBe(demo.DEMO_VISITOR_EMAIL);
    await expect(
      auth.api.signInEmail({
        body: {
          email: demo.DEMO_VISITOR_EMAIL,
          password: "wrong-password-123",
        },
      }),
    ).rejects.toThrow();
    expect(credentials[0]!.password).not.toContain(demo.demoPassword());
  });

  it("renews it every time: one demo workspace, new ids, the same people", async () => {
    const users = await db.user.count({ where: { isDemo: true } });
    const second = await demo.regenerateDemo(NOW);
    expect(second.workspaceId).not.toBe(first.workspaceId);
    expect({ tasks: second.tasks, events: second.events }).toEqual({
      tasks: first.tasks,
      events: first.events,
    });
    expect(await db.workspace.count({ where: { isDemo: true } })).toBe(1);
    expect(await db.user.count({ where: { isDemo: true } })).toBe(users);
    first = second;
  });

  it("never reads or deletes a real workspace, not even one with the same name", async () => {
    const fixture = await createListFor(world);
    await db.workspace.update({
      where: { id: fixture.workspaceId },
      data: { name: "Acme Product Team" },
    });
    const before = await snapshot(fixture.workspaceId);
    const realUsers = await db.user.count({ where: { isDemo: false } });
    const realWorkspaces = await db.workspace.count({
      where: { isDemo: false },
    });
    await demo.regenerateDemo(NOW);
    expect(await snapshot(fixture.workspaceId)).toEqual(before);
    expect(await db.user.count({ where: { isDemo: false } })).toBe(realUsers);
    expect(await db.workspace.count({ where: { isDemo: false } })).toBe(
      realWorkspaces,
    );
    expect(await db.workspace.count({ where: { isDemo: true } })).toBe(1);
  });

  it("builds it the first time it is asked for, and returns the same one after", async () => {
    await wipeDemo();
    const id = await demo.ensureDemo();
    expect(await demo.ensureDemo()).toBe(id);
    expect(
      (await db.workspace.findUniqueOrThrow({ where: { id } })).isDemo,
    ).toBe(true);
  });
});

describe("what the visitor can do", () => {
  let visitor: Actor;
  let workspaceId: string;
  let listId: string;
  let columnId: string;
  beforeAll(async () => {
    workspaceId = (await demo.regenerateDemo(NOW)).workspaceId;
    const user = await db.user.findUniqueOrThrow({
      where: { email: demo.DEMO_VISITOR_EMAIL },
    });
    visitor = await sessionOf(user.id);
    const list = await db.list.findFirstOrThrow({
      where: { space: { workspaceId }, name: "Platform" },
      include: { columns: true },
    });
    listId = list.id;
    columnId = list.columns[0]!.id;
  });

  it("reads the workspace, the metrics and the forecast", async () => {
    const tree = await getWorkspace(visitor.id, workspaceId);
    expect(tree.role).toBe("GUEST");
    expect(tree.spaces.map((s) => s.name).sort()).toEqual([
      "Software",
      "Support",
    ]);
    const metrics = await getListMetrics(
      visitor.id,
      listId,
      {
        from: NOW - 89 * 86_400_000 - (NOW % 86_400_000),
        to: NOW - (NOW % 86_400_000),
      },
      NOW,
    );
    expect(metrics.throughput.total).toBeGreaterThan(20);
    const forecast = await getListForecast(
      visitor.id,
      listId,
      parseForecastQuery({}, NOW),
      NOW,
    );
    expect(forecast.possible).toBe(true);
    expect(forecast.warnings).toEqual([]);
  });

  it("cannot write: tasks, structure, workspaces, preferences and account changes are refused", async () => {
    const version = (await db.list.findUniqueOrThrow({ where: { id: listId } }))
      .boardVersion;
    const create = await callAs(
      visitor,
      tasksRoute.POST,
      req("POST", `/api/lists/${listId}/tasks`, {
        id: crypto.randomUUID(),
        columnId,
        title: "Sneaky",
        expectedBoardVersion: version,
      }),
      { listId },
    );
    expect(create.status).toBe(403);
    const rename = await callAs(
      visitor,
      listRoute.PATCH,
      req("PATCH", `/api/lists/${listId}`, {
        name: "Hacked",
        expectedBoardVersion: version,
      }),
      { listId },
    );
    expect(rename.status).toBe(403);
    const newWorkspace = await callAs(
      visitor,
      workspacesRoute.POST,
      req("POST", "/api/workspaces", { name: "Mine" }),
    );
    expect(newWorkspace.status).toBe(403);
    expect((await newWorkspace.json()).error.code).toBe("DEMO_READ_ONLY");
    const preference = await callAs(
      visitor,
      meRoute.PATCH,
      req("PATCH", "/api/me", { digestEmail: true }),
    );
    expect(preference.status).toBe(403);
    expect(await db.task.count({ where: { listId, title: "Sneaky" } })).toBe(0);
    expect(
      (await db.list.findUniqueOrThrow({ where: { id: listId } })).name,
    ).toBe("Platform");

    // The account itself cannot be changed through the auth endpoints either.
    const headers = new Headers({ cookie: visitor.cookie });
    await expect(
      auth.api.updateUser({ headers, body: { name: "Not the visitor" } }),
    ).rejects.toThrow(/read-only/);
    await expect(
      auth.api.changePassword({
        headers,
        body: {
          currentPassword: demo.demoPassword(),
          newPassword: "another-long-password",
        },
      }),
    ).rejects.toThrow(/read-only/);
    const row = await db.user.findUniqueOrThrow({
      where: { email: demo.DEMO_VISITOR_EMAIL },
    });
    expect(row.name).toBe("Demo visitor");
  });

  it("a normal user is not affected by the guard (control)", async () => {
    const headers = new Headers({ cookie: world.member.cookie });
    await expect(
      auth.api.updateUser({ headers, body: { name: "Renamed member" } }),
    ).resolves.toBeDefined();
    const res = await callAs(
      world.member,
      meRoute.PATCH,
      req("PATCH", "/api/me", { digestEmail: true }),
    );
    expect(res.status).toBe(200);
  });

  it("cannot mark the alerts as read: it is one account shared by every visitor", async () => {
    const res = await callAs(
      visitor,
      readRoute.POST,
      req("POST", "/api/notifications/read", {}),
    );
    expect(res.status).toBe(403);
    expect((await res.json()).error.code).toBe("DEMO_READ_ONLY");
  });

  it("cannot list the sessions of the shared account, which are the other visitors'", async () => {
    const headers = new Headers({ cookie: visitor.cookie });
    await expect(auth.api.listSessions({ headers })).rejects.toThrow(
      /read-only/,
    );
    // A normal user still sees their own (control).
    const own = new Headers({ cookie: world.member.cookie });
    await expect(
      auth.api.listSessions({ headers: own }),
    ).resolves.toBeDefined();
  });
});

describe("the alerts of the demo", () => {
  it("reach the visitor, who is a guest and would not get them anywhere else", async () => {
    const { workspaceId } = await demo.regenerateDemo(NOW);
    await runAlerts(NOW);
    const user = await db.user.findUniqueOrThrow({
      where: { email: demo.DEMO_VISITOR_EMAIL },
    });
    const mine = (await listNotifications(user.id)).open.filter(
      (n) => n.listName === "Platform",
    );
    const messages = mine.map((n) => n.message);
    expect(
      messages.some((m) =>
        m.includes('"Code review" has been over its WIP limit'),
      ),
    ).toBe(true);
    // The made-up admin hears the same, and no real person ever gets one from the demo.
    const owner = await db.user.findUniqueOrThrow({
      where: { id: "demo-dana" },
    });
    expect(
      (await listNotifications(owner.id)).open.some(
        (n) => n.listName === "Platform",
      ),
    ).toBe(true);
    const outsiders = await db.notification.count({
      where: {
        list: { space: { workspaceId } },
        user: { isDemo: false },
      },
    });
    expect(outsiders).toBe(0);
  });

  it("a real guest does not get the admins' alerts: the exception is for the demo only", async () => {
    const fixture = await createListFor(world);
    expect(
      await db.notification.count({
        where: { listId: fixture.listId, userId: world.guest.id },
      }),
    ).toBe(0);
  });
});

describe("turning it on and off", () => {
  it("the entry is a 404 unless the deployment turns the demo on", async () => {
    delete process.env.DEMO_ENABLED;
    expect(demo.demoEnabled()).toBe(false);
    await expect(actions.startDemo()).rejects.toThrow();
  });

  it("the daily job renews the demo only when it is on, and still runs the alerts", async () => {
    process.env.CRON_SECRET = "a-secret-for-the-demo-test";
    const call = () =>
      cronRoute.GET(
        new Request(`${BASE}/api/cron/alerts`, {
          headers: { authorization: "Bearer a-secret-for-the-demo-test" },
        }),
      );
    delete process.env.DEMO_ENABLED;
    const off = await (await call()).json();
    expect(off.demo).toBeNull();
    expect(off.alerts.failed).toBe(0);

    process.env.DEMO_ENABLED = "1";
    const before = await db.workspace.findFirstOrThrow({
      where: { isDemo: true },
    });
    const on = await (await call()).json();
    expect(on.demo.workspaceId).toBeTruthy();
    expect(on.demo.workspaceId).not.toBe(before.id);
    expect(on.alerts.failed).toBe(0);
    delete process.env.DEMO_ENABLED;
  });
});

describe("the demo visitor is nobody's member", () => {
  it("is refused as a member of a real workspace, like an unknown email", async () => {
    const { addMember } = await import("@/server/services/members");
    const { workspaceId } = await createListFor(world);
    await expect(
      addMember(world.owner.id, workspaceId, {
        email: demo.DEMO_VISITOR_EMAIL,
        role: "MEMBER",
      }),
    ).rejects.toMatchObject({ status: 404, code: "USER_NOT_FOUND" });
    const visitor = await db.user.findUniqueOrThrow({
      where: { email: demo.DEMO_VISITOR_EMAIL },
    });
    expect(
      await db.workspaceMember.count({
        where: { workspaceId, userId: visitor.id },
      }),
    ).toBe(0);
    // A real user is still added (control).
    await expect(
      addMember(world.owner.id, workspaceId, {
        email: world.candidate.email,
        role: "MEMBER",
      }),
    ).resolves.toBeDefined();
  });
});
