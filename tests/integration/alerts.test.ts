import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const { runAlerts } = await import("@/server/services/alerts");
const { listNotifications, markRead, unreadCount } =
  await import("@/server/services/notifications");
const cronRoute = await import("@/app/api/cron/alerts/route");
const readRoute = await import("@/app/api/notifications/read/route");
const notificationsRoute = await import("@/app/api/notifications/route");
const listRoute = await import("@/app/api/lists/[listId]/route");
const meRoute = await import("@/app/api/me/route");

const BASE = "http://localhost:3000";
const OK = { origin: BASE, "content-type": "application/json" };
const req = (
  method: string,
  path: string,
  body?: object,
  headers: Record<string, string> = OK,
) =>
  new Request(`${BASE}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

// March 2026 (UTC). "Now" is the 16th at noon.
const at = (day: string, time = "09:00") =>
  new Date(`2026-03-${day}T${time}:00Z`);
const NOW = at("16", "12:00").getTime();

type Fixture = Awaited<ReturnType<typeof createListFor>>;
type Step = [type: "CREATED" | "MOVED", when: Date, stage: string];

async function addTask(
  fixture: Fixture,
  title: string,
  steps: Step[],
  assignees: string[] = [],
) {
  const stages = await db.boardColumn.findMany({
    where: { listId: fixture.listId },
  });
  const stage = (name: string) => stages.find((s) => s.name === name)!;
  const last = stage(steps[steps.length - 1]![2]);
  const task = await db.task.create({
    data: {
      listId: fixture.listId,
      columnId: last.id,
      title,
      position: await db.task.count({ where: { columnId: last.id } }),
      createdById: world.owner.id,
      assignees: { create: assignees.map((userId) => ({ userId })) },
    },
  });
  await db.taskEvent.createMany({
    data: steps.map(([type, when, name]) => ({
      taskId: task.id,
      listId: fixture.listId,
      type,
      at: when,
      toStageId: stage(name).id,
      toCategory: stage(name).category,
      actorId: world.owner.id,
    })),
  });
  return task;
}

/**
 * The history that was worked out by hand: five tasks finished in one day each (so the 85th
 * percentile of cycle time is one day), two tasks that entered "In progress" on the 12th (over its
 * limit of one since then), and one old task in progress for 14 days, assigned to the member.
 */
async function seedList(options?: { privateSpace?: boolean }) {
  const fixture = await createListFor(world, options);
  await db.task.deleteMany({ where: { listId: fixture.listId } });
  const stage = await db.boardColumn.findFirstOrThrow({
    where: { listId: fixture.listId, name: "In progress" },
  });
  await db.boardColumn.update({
    where: { id: stage.id },
    data: { wipLimit: 1 },
  });
  for (let i = 1; i <= 5; i++) {
    await addTask(fixture, `Finished ${i}`, [
      ["CREATED", at("02"), "To do"],
      ["MOVED", at("03"), "In progress"],
      ["MOVED", at("04"), "Done"],
    ]);
  }
  for (const title of ["Wip 1", "Wip 2"]) {
    await addTask(fixture, title, [
      ["CREATED", at("11"), "To do"],
      ["MOVED", at("12"), "In progress"],
    ]);
  }
  const old = await addTask(
    fixture,
    "Old one",
    [
      ["CREATED", at("01"), "To do"],
      ["MOVED", at("02"), "In progress"],
    ],
    [world.member.id],
  );
  return { fixture, stageId: stage.id, oldId: old.id };
}

const open = (listId: string, userId: string) =>
  db.notification
    .findMany({ where: { listId, userId, resolvedAt: null } })
    .then((rows) => rows.map((r) => r.key).sort());

describe("the daily alerts job", () => {
  let seeded: Awaited<ReturnType<typeof seedList>>;
  beforeAll(async () => {
    seeded = await seedList();
  });

  it("does not alert before the thresholds are reached, and the thresholds are per list", async () => {
    await db.list.update({
      where: { id: seeded.fixture.listId },
      data: { alertWipDays: 10 },
    });
    await runAlerts(NOW);
    const keys = await open(seeded.fixture.listId, world.owner.id);
    expect(keys.some((k) => k.startsWith("wip:"))).toBe(false);
  });

  it("notifies the admins of stage alerts and the assignees of a task that is too old", async () => {
    await db.list.update({
      where: { id: seeded.fixture.listId },
      data: { alertWipDays: 3 },
    });
    await runAlerts(NOW);
    const { listId } = seeded.fixture;
    const wipTasks = await db.task.findMany({
      where: { listId, title: { startsWith: "Wip" } },
    });
    const adminKeys = [
      "drop",
      `wip:${seeded.stageId}`,
      ...wipTasks.map((t) => `age:${t.id}`),
    ].sort();
    expect(await open(listId, world.owner.id)).toEqual(adminKeys);
    expect(await open(listId, world.admin.id)).toEqual(adminKeys);
    // The old task has an assignee, so only they hear about it; nobody else gets it.
    expect(await open(listId, world.member.id)).toEqual([
      `age:${seeded.oldId}`,
    ]);
    expect(await open(listId, world.guest.id)).toEqual([]);
  });

  it("says what is wrong in words", async () => {
    const mine = await listNotifications(world.member.id);
    expect(mine.open).toHaveLength(1);
    expect(mine.open[0]!.message).toContain('"Old one"');
    expect(mine.open[0]!.message).toContain("14.1 days");
    expect(mine.open[0]!.listName).toBe("Fixture list");
    const admins = (await listNotifications(world.owner.id)).open.map(
      (n) => n.message,
    );
    expect(
      admins.some((m) =>
        m.includes('"In progress" has been over its WIP limit for 5 days'),
      ),
    ).toBe(true);
    expect(admins.some((m) => m.includes("a drop of 100%"))).toBe(true);
  });

  it("is idempotent: running it again changes nothing", async () => {
    const before = await db.notification.findMany({
      where: { listId: seeded.fixture.listId },
      orderBy: { id: "asc" },
    });
    await runAlerts(NOW);
    await runAlerts(NOW);
    const after = await db.notification.findMany({
      where: { listId: seeded.fixture.listId },
      orderBy: { id: "asc" },
    });
    expect(after).toEqual(before);
  });

  it("resolves an alert when the condition stops holding, and keeps the rest", async () => {
    await db.boardColumn.update({
      where: { id: seeded.stageId },
      data: { wipLimit: 5 },
    });
    await runAlerts(NOW);
    const { listId } = seeded.fixture;
    expect(
      (await open(listId, world.owner.id)).some((k) => k.startsWith("wip:")),
    ).toBe(false);
    expect(await open(listId, world.member.id)).toEqual([
      `age:${seeded.oldId}`,
    ]);
    const resolved = await listNotifications(world.owner.id);
    expect(resolved.resolved.map((n) => n.message)[0]).toContain("WIP limit");
  });

  it("alerts again when the condition comes back after being resolved", async () => {
    await db.boardColumn.update({
      where: { id: seeded.stageId },
      data: { wipLimit: 1 },
    });
    await runAlerts(NOW);
    expect(
      (await open(seeded.fixture.listId, world.owner.id)).some((k) =>
        k.startsWith("wip:"),
      ),
    ).toBe(true);
    expect(
      await db.notification.count({
        where: {
          listId: seeded.fixture.listId,
          key: `wip:${seeded.stageId}`,
          userId: world.owner.id,
        },
      }),
    ).toBe(2);
  });
});

describe("who can see an alert", () => {
  it("never reaches people who cannot see the space, even if they are assigned elsewhere", async () => {
    const hidden = await seedList({ privateSpace: true });
    await runAlerts(NOW);
    const { listId } = hidden.fixture;
    // The member is assigned to the old task but is not listed in the private space: nobody but
    // the admins is told, and the member's inbox stays empty.
    expect(await open(listId, world.member.id)).toEqual([]);
    expect((await open(listId, world.admin.id)).length).toBeGreaterThan(0);
    expect(
      (await listNotifications(world.member.id)).open.some(
        (n) => n.listId === listId,
      ),
    ).toBe(false);
  });

  it("hides an alert when the person loses access afterwards", async () => {
    const shared = await seedList({ privateSpace: true });
    await db.spaceMember.create({
      data: {
        spaceId: shared.fixture.spaceId,
        workspaceId: shared.fixture.workspaceId,
        userId: world.member.id,
      },
    });
    await runAlerts(NOW);
    const seen = () =>
      listNotifications(world.member.id).then((r) =>
        r.open.filter((n) => n.listId === shared.fixture.listId),
      );
    expect(await seen()).toHaveLength(1);
    await db.spaceMember.deleteMany({
      where: { spaceId: shared.fixture.spaceId, userId: world.member.id },
    });
    expect(await seen()).toHaveLength(0);
    expect(await unreadCount(world.member.id)).toBe(
      (await listNotifications(world.member.id)).open.filter((n) => !n.readAt)
        .length,
    );
  });
});

describe("reading and marking alerts", () => {
  it("counts unread ones and marks one, then all, as read", async () => {
    const mine = (await listNotifications(world.owner.id)).open;
    expect(mine.length).toBeGreaterThan(1);
    const before = await unreadCount(world.owner.id);
    expect(before).toBe(mine.length);

    const one = await callAs(
      world.owner,
      readRoute.POST,
      req("POST", "/api/notifications/read", { id: mine[0]!.id }),
    );
    expect(one.status).toBe(204);
    expect(await unreadCount(world.owner.id)).toBe(before - 1);

    // Somebody else's id changes nothing.
    await callAs(
      world.guest,
      readRoute.POST,
      req("POST", "/api/notifications/read", { id: mine[1]!.id }),
    );
    expect(await unreadCount(world.owner.id)).toBe(before - 1);

    await markRead(world.owner.id);
    expect(await unreadCount(world.owner.id)).toBe(0);
  });

  it("the API requires a session and the same origin, and rejects unknown fields", async () => {
    expect(
      (
        await callAs(
          null,
          notificationsRoute.GET,
          req("GET", "/api/notifications"),
        )
      ).status,
    ).toBe(401);
    expect(
      (
        await callAs(
          null,
          readRoute.POST,
          req("POST", "/api/notifications/read", {}),
        )
      ).status,
    ).toBe(401);
    const noOrigin = req(
      "POST",
      "/api/notifications/read",
      {},
      { "content-type": "application/json" },
    );
    expect((await callAs(world.owner, readRoute.POST, noOrigin)).status).toBe(
      403,
    );
    expect(
      (
        await callAs(
          world.owner,
          readRoute.POST,
          req("POST", "/api/notifications/read", { user: "x" }),
        )
      ).status,
    ).toBe(400);
    const list = await callAs(
      world.owner,
      notificationsRoute.GET,
      req("GET", "/api/notifications"),
    );
    expect(Object.keys(await list.json()).sort()).toEqual(["open", "resolved"]);
  });
});

describe("the daily email preference", () => {
  it("is off by default and the user changes only their own", async () => {
    const before = await db.user.findUniqueOrThrow({
      where: { id: world.member.id },
    });
    expect(before.digestEmail).toBe(false);
    const res = await callAs(
      world.member,
      meRoute.PATCH,
      req("PATCH", "/api/me", { digestEmail: true }),
    );
    expect(res.status).toBe(200);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: world.member.id } }))
        .digestEmail,
    ).toBe(true);
    expect(
      (await db.user.findUniqueOrThrow({ where: { id: world.guest.id } }))
        .digestEmail,
    ).toBe(false);
    expect(
      (
        await callAs(
          world.member,
          meRoute.PATCH,
          req("PATCH", "/api/me", { digestEmail: "yes" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await callAs(
          world.member,
          meRoute.PATCH,
          req("PATCH", "/api/me", { name: "x" }),
        )
      ).status,
    ).toBe(400);
    expect(
      (
        await callAs(
          null,
          meRoute.PATCH,
          req("PATCH", "/api/me", { digestEmail: true }),
        )
      ).status,
    ).toBe(401);
  });
});

describe("the thresholds of a list", () => {
  let actor: Actor;
  it("an admin edits them within limits; a member cannot", async () => {
    actor = world.admin;
    const { fixture } = await seedList();
    const version = (
      await db.list.findUniqueOrThrow({ where: { id: fixture.listId } })
    ).boardVersion;
    const patch = (who: Actor, body: object) =>
      callAs(
        who,
        listRoute.PATCH,
        req("PATCH", `/api/lists/${fixture.listId}`, body),
        { listId: fixture.listId },
      );
    const ok = await patch(actor, {
      alertWipDays: "5",
      alertBandDays: 7,
      alertDropPercent: "30",
      expectedBoardVersion: version,
    });
    expect(ok.status).toBe(200);
    const row = await db.list.findUniqueOrThrow({
      where: { id: fixture.listId },
    });
    expect([row.alertWipDays, row.alertBandDays, row.alertDropPercent]).toEqual(
      [5, 7, 30],
    );
    for (const bad of [
      { alertWipDays: 0 },
      { alertWipDays: 31 },
      { alertDropPercent: 9 },
      { alertDropPercent: 91 },
      { alertBandDays: 1.5 },
    ]) {
      const res = await patch(actor, {
        ...bad,
        expectedBoardVersion: row.boardVersion,
      });
      expect(res.status, JSON.stringify(bad)).toBe(400);
    }
    const denied = await patch(world.member, {
      alertWipDays: 2,
      expectedBoardVersion: row.boardVersion,
    });
    expect(denied.status).toBe(403);
  });
});

describe("the cron endpoint", () => {
  const call = (authorization?: string) =>
    cronRoute.GET(
      new Request(`${BASE}/api/cron/alerts`, {
        headers: authorization ? { authorization } : {},
      }),
    );

  it("is off without a secret, and refuses a wrong one", async () => {
    delete process.env.CRON_SECRET;
    expect((await call("Bearer anything")).status).toBe(503);
    process.env.CRON_SECRET = "a-secret-for-the-test-run";
    expect((await call()).status).toBe(401);
    expect((await call("Bearer wrong")).status).toBe(401);
    expect((await call("a-secret-for-the-test-run")).status).toBe(401);
  });

  it("runs the job and the digests with the right secret", async () => {
    process.env.CRON_SECRET = "a-secret-for-the-test-run";
    const res = await call("Bearer a-secret-for-the-test-run");
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.alerts.failed).toBe(0);
    expect(body.digests).toEqual(expect.objectContaining({ failed: 0 }));
  });
});
