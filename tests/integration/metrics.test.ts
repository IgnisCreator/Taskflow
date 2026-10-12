import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const listMetricsRoute = await import("@/app/api/lists/[listId]/metrics/route");
const spaceMetricsRoute =
  await import("@/app/api/spaces/[spaceId]/metrics/route");
const tasksRoute = await import("@/app/api/lists/[listId]/tasks/route");
const moveRoute =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/move/route");
const flowRoute = await import("@/app/api/lists/[listId]/flow/route");
const { getListMetrics, getSpaceMetrics } =
  await import("@/server/services/metrics");
const { parseMetricsQuery } = await import("@/lib/validations/metrics");

const BASE = "http://localhost:3000";
const OK = { origin: BASE, "content-type": "application/json" };
const req = (method: string, path: string, body?: object) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: OK,
    body: body ? JSON.stringify(body) : undefined,
  });

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

// March 2026 (UTC; the 2nd is a Monday). "Now" is March 16, 12:00.
const at = (day: string, time = "09:00") =>
  new Date(`2026-03-${day}T${time}:00Z`);
const NOW = at("16", "12:00").getTime();
const RANGE = parseMetricsQuery({ from: "2026-03-02", to: "2026-03-15" }, NOW);

type Fixture = Awaited<ReturnType<typeof createListFor>>;
type Step = [
  type:
    "CREATED" | "MOVED" | "BLOCKED" | "UNBLOCKED" | "DISCARDED" | "REOPENED",
  when: Date,
  stage: string,
];

/** Writes a task and its history straight into the database, with the times given. */
async function addTask(
  fixture: Fixture,
  title: string,
  steps: Step[],
  extra: { typeId?: string; assignees?: string[]; listId?: string } = {},
) {
  const listId = extra.listId ?? fixture.listId;
  const stages = await db.boardColumn.findMany({ where: { listId } });
  const stage = (name: string) => stages.find((s) => s.name === name)!;
  const last = stage(steps[steps.length - 1]![2]);
  const task = await db.task.create({
    data: {
      listId,
      columnId: last.id,
      title,
      position: await db.task.count({ where: { columnId: last.id } }),
      createdById: world.owner.id,
      typeId: extra.typeId,
      assignees: {
        create: (extra.assignees ?? []).map((userId) => ({ userId })),
      },
    },
  });
  await db.taskEvent.createMany({
    data: steps.map(([type, when, name]) => ({
      taskId: task.id,
      listId,
      type,
      at: when,
      toStageId: stage(name).id,
      toCategory: stage(name).category,
      actorId: world.owner.id,
    })),
  });
  return task;
}

/** Five tasks whose metrics were worked out by hand (see the expectations below). */
async function seedWorld() {
  const fixture = await createListFor(world);
  await db.task.deleteMany({ where: { listId: fixture.listId } }); // the fixture task has no history
  const bug = await db.workItemType.findFirstOrThrow({
    where: { workspaceId: fixture.workspaceId, name: "Bug" },
  });
  await addTask(
    fixture,
    "A",
    [
      ["CREATED", at("02"), "To do"],
      ["MOVED", at("03"), "In progress"],
      ["MOVED", at("05"), "In review"],
      ["MOVED", at("06"), "Done"],
    ],
    { typeId: bug.id, assignees: [world.member.id] },
  );
  await addTask(
    fixture,
    "B",
    [
      ["CREATED", at("02", "12:00"), "To do"],
      ["MOVED", at("04", "12:00"), "In progress"],
      ["BLOCKED", at("05", "12:00"), "In progress"],
      ["UNBLOCKED", at("07", "12:00"), "In progress"],
      ["MOVED", at("08", "12:00"), "Done"],
    ],
    { assignees: [world.admin.id] },
  );
  await addTask(fixture, "C", [
    ["CREATED", at("10"), "To do"],
    ["MOVED", at("11"), "In progress"],
  ]);
  await addTask(fixture, "D", [["CREATED", at("09"), "To do"]]);
  await addTask(fixture, "E", [
    ["CREATED", at("03"), "To do"],
    ["MOVED", at("04"), "In progress"],
    ["DISCARDED", at("06"), "Discarded"],
  ]);
  return fixture;
}

describe("the metrics of a list", () => {
  it("computes throughput, cycle time, lead time, WIP, age and efficiency from the history", async () => {
    const f = await seedWorld();
    const m = await getListMetrics(world.owner.id, f.listId, RANGE, NOW);

    expect(m.throughput.total).toBe(2); // A (Mar 6) and B (Mar 8); E was discarded
    expect(
      m.throughput.daily.filter((d) => d.count).map((d) => d.date),
    ).toEqual(["2026-03-06", "2026-03-08"]);
    expect(m.throughput.weekly).toEqual([
      { weekStart: "2026-03-02", count: 2 },
      { weekStart: "2026-03-09", count: 0 },
    ]);
    // A: cycle 3 and lead 4. B: cycle 4 (blocking does not stop the clock) and lead 6.
    expect(m.cycleTime).toEqual({ count: 2, p50: 3, p85: 4, p95: 4 });
    expect(m.leadTime).toEqual({ count: 2, p50: 4, p85: 6, p95: 6 });
    // Active days: A 3 (2 in progress, 1 in review), B 2. Waiting: B was blocked for 2 days.
    expect(m.flowEfficiency.activeDays).toBe(5);
    expect(m.flowEfficiency.waitingDays).toBe(2);
    expect(m.flowEfficiency.blockedDays).toBe(2);
    expect(m.flowEfficiency.ratio).toBeCloseTo(5 / 7, 10);

    expect(m.wip.total).toBe(1); // C
    expect(m.age).toEqual([expect.objectContaining({ days: 5.125 })]); // Mar 11 09:00 to Mar 16 12:00
    expect(m.reopened).toBe(0);
  });

  it("gives the stages and the titles the charts need, and a CFD that adds up", async () => {
    const f = await seedWorld();
    const m = await getListMetrics(world.owner.id, f.listId, RANGE, NOW);

    expect(m.scope).toBe("list");
    expect(m.stages.map((s) => [s.name, s.category])).toEqual([
      ["To do", "BACKLOG"],
      ["In progress", "ACTIVE"],
      ["In review", "ACTIVE"],
      ["Done", "DONE"],
      ["Discarded", "DISCARDED"],
    ]);
    expect(Object.values(m.titles).sort()).toEqual(["A", "B", "C", "D", "E"]);

    const byName = (name: string) => m.stages.find((s) => s.name === name)!.id;
    const series = (name: string) =>
      m.cfd.series.find((s) => s.bucket === byName(name))!.counts;
    const last = m.cfd.days.length - 1;
    expect([
      series("To do")[last],
      series("In progress")[last],
      series("Done")[last],
      series("Discarded")[last],
    ]).toEqual([1, 1, 2, 1]);
    // The series follow the flow, left to right.
    expect(m.cfd.series.map((s) => s.bucket)).toEqual(
      m.stages
        .map((s) => s.id)
        .filter((id) => m.cfd.series.some((x) => x.bucket === id)),
    );
    // End of Mar 3: A is in progress, B is still in to do, E is created.
    expect(series("In progress")[1]).toBe(1);
    expect(series("To do")[1]).toBe(2);
  });

  it("filters by type and by assignee, including 'none'", async () => {
    const f = await seedWorld();
    const bug = await db.workItemType.findFirstOrThrow({
      where: { workspaceId: f.workspaceId, name: "Bug" },
    });
    const run = (extra: object) =>
      getListMetrics(world.owner.id, f.listId, { ...RANGE, ...extra }, NOW);

    expect((await run({ type: bug.id })).throughput.total).toBe(1); // A
    expect((await run({ type: "none" })).throughput.total).toBe(1); // B
    expect((await run({ assignee: world.member.id })).throughput.total).toBe(1); // A
    expect((await run({ assignee: world.admin.id })).cycleTime.p50).toBe(4); // B
    expect((await run({ assignee: "none" })).throughput.total).toBe(0); // C, D, E have nobody
    expect((await run({ assignee: world.owner.id })).wip.total).toBe(0);
  });

  it("counts a reopening in the range and keeps the cycle time from the first start", async () => {
    const f = await createListFor(world);
    await db.task.deleteMany({ where: { listId: f.listId } });
    await addTask(f, "R", [
      ["CREATED", at("04", "10:00"), "To do"],
      ["MOVED", at("05", "10:00"), "In progress"],
      ["MOVED", at("06", "10:00"), "Done"],
      ["REOPENED", at("09", "10:00"), "In progress"],
      ["MOVED", at("12", "10:00"), "Done"],
    ]);
    const m = await getListMetrics(world.owner.id, f.listId, RANGE, NOW);
    expect(m.reopened).toBe(1);
    expect(m.throughput.total).toBe(1);
    expect(m.cycleTime.p50).toBe(7);
    expect(m.leadTime.p50).toBe(8);
  });
});

describe("the commitment point", () => {
  it("work only starts at the commitment point, not at an active stage before it", async () => {
    const f = await createListFor(world);
    const list = await db.list.create({
      data: {
        spaceId: f.spaceId,
        name: "With triage",
        columns: {
          create: [
            { name: "Inbox", position: 0, category: "BACKLOG" },
            { name: "Triage", position: 1, category: "ACTIVE" }, // active, but before the commitment point
            {
              name: "Doing",
              position: 2,
              category: "ACTIVE",
              isCommitmentPoint: true,
            },
            { name: "Done", position: 3, category: "DONE" },
            { name: "Dropped", position: 4, category: "DISCARDED" },
          ],
        },
      },
    });
    await addTask(
      f,
      "T",
      [
        ["CREATED", at("02"), "Inbox"],
        ["MOVED", at("03"), "Triage"],
        ["MOVED", at("05"), "Doing"],
        ["MOVED", at("06"), "Done"],
      ],
      { listId: list.id },
    );

    const m = await getListMetrics(world.owner.id, list.id, RANGE, NOW);
    expect(m.cycleTime.p50).toBe(1); // from Mar 5 (Doing), not from Mar 3 (Triage)
    expect(m.leadTime.p50).toBe(4);
    // The same history in a flow whose commitment point is the first active stage starts earlier.
    await db.boardColumn.updateMany({
      where: { listId: list.id, name: "Doing" },
      data: { isCommitmentPoint: false },
    });
    await db.boardColumn.updateMany({
      where: { listId: list.id, name: "Triage" },
      data: { isCommitmentPoint: true },
    });
    expect(
      (await getListMetrics(world.owner.id, list.id, RANGE, NOW)).cycleTime.p50,
    ).toBe(3);
  });
});

describe("a history that outlives its stages", () => {
  it("still gives the same answers after the flow editor removes a stage the task passed through", async () => {
    const f = await createListFor(world);
    await db.task.deleteMany({ where: { listId: f.listId } });
    await addTask(f, "G", [
      ["CREATED", at("02"), "To do"],
      ["MOVED", at("03"), "In review"],
      ["MOVED", at("05"), "Done"],
    ]);
    const before = await getListMetrics(world.owner.id, f.listId, RANGE, NOW);

    // Remove the empty "In review" stage: its events lose the stage id but keep the category.
    const stages = (
      await db.boardColumn.findMany({
        where: { listId: f.listId },
        orderBy: { position: "asc" },
      })
    )
      .filter((c) => c.name !== "In review")
      .map((c) => ({
        id: c.id,
        name: c.name,
        category: c.category,
        wipLimit: c.wipLimit,
        policy: c.policy,
        isCommitmentPoint: c.isCommitmentPoint,
      }));
    const res = await callAs(
      world.owner,
      flowRoute.PUT,
      req("PUT", `/api/lists/${f.listId}/flow`, {
        expectedBoardVersion: 0,
        stages,
      }),
      {
        listId: f.listId,
      },
    );
    expect(res.status).toBe(200);
    expect(
      await db.taskEvent.count({
        where: {
          taskId: (
            await db.task.findFirstOrThrow({ where: { listId: f.listId } })
          ).id,
          toStageId: null,
        },
      }),
    ).toBe(1);

    const after = await getListMetrics(world.owner.id, f.listId, RANGE, NOW);
    expect(after.cycleTime).toEqual(before.cycleTime); // still 2 days: started on entering "In review"
    expect(after.cycleTime.p50).toBe(2);
    // The days it spent there are now a band for removed active stages.
    const gone = after.cfd.series.find((s) => s.bucket === "removed:ACTIVE")!;
    expect(gone.counts.slice(0, 5)).toEqual([0, 1, 1, 0, 0]);
  });
});

describe("real operations leave a history the metrics can read", () => {
  it("a task created and moved through the API shows up as finished, with no work in progress", async () => {
    const f = await createListFor(world);
    await db.task.deleteMany({ where: { listId: f.listId } });
    const stages = await db.boardColumn.findMany({
      where: { listId: f.listId },
    });
    const id = (name: string) => stages.find((s) => s.name === name)!.id;
    const taskId = crypto.randomUUID();
    const create = await callAs(
      world.member,
      tasksRoute.POST,
      req("POST", `/api/lists/${f.listId}/tasks`, {
        id: taskId,
        columnId: id("To do"),
        title: "Live",
        expectedBoardVersion: 0,
      }),
      { listId: f.listId },
    );
    expect(create.status).toBe(201);
    let version = 1;
    for (const to of ["In progress", "Done"]) {
      const res = await callAs(
        world.member,
        moveRoute.PATCH,
        req("PATCH", `/api/lists/${f.listId}/tasks/${taskId}/move`, {
          columnId: id(to),
          toIndex: 0,
          expectedBoardVersion: version++,
        }),
        { listId: f.listId, taskId },
      );
      expect(res.status).toBe(200);
    }

    const today = parseMetricsQuery({}, Date.now());
    const m = await getListMetrics(world.owner.id, f.listId, today);
    expect(m.throughput.total).toBe(1);
    expect(m.wip.total).toBe(0);
    expect(m.cycleTime.count).toBe(1);
    expect(m.cycleTime.p50!).toBeGreaterThanOrEqual(0);
    expect(m.cycleTime.p50!).toBeLessThan(1);
  });
});

describe("access and validation", () => {
  const get = (
    listId: string,
    actor: Actor | null,
    query = "?from=2026-03-02&to=2026-03-15",
  ) =>
    callAs(
      actor,
      listMetricsRoute.GET,
      req("GET", `/api/lists/${listId}/metrics${query}`),
      { listId },
    );

  it("anyone who can see the list reads its metrics, nobody else", async () => {
    const f = await seedWorld();
    for (const actor of [world.owner, world.admin, world.member, world.guest]) {
      expect((await get(f.listId, actor)).status).toBe(200);
    }
    expect((await get(f.listId, world.stranger)).status).toBe(404);
    expect((await get(f.listId, null)).status).toBe(401);
  });

  it("a list in a private space nobody is listed in is hidden, even from a member", async () => {
    const f = await createListFor(world, { privateSpace: true });
    expect((await get(f.listId, world.member)).status).toBe(404);
    expect((await get(f.listId, world.admin)).status).toBe(200);
  });

  it("without dates it is the last 30 days ending today", async () => {
    const f = await createListFor(world);
    const res = await get(f.listId, world.owner, "");
    const { range } = await res.json();
    const today = new Date().toISOString().slice(0, 10);
    expect(range.to).toBe(today);
    const from = Date.parse(`${today}T00:00:00Z`) - 29 * 86_400_000;
    expect(range.from).toBe(new Date(from).toISOString().slice(0, 10));
  });

  it.each([
    ["a date that does not exist", "?from=2026-02-30"],
    ["a date in the wrong format", "?from=03/02/2026"],
    ["a range that ends before it starts", "?from=2026-03-10&to=2026-03-02"],
    ["a range longer than a year", "?from=2024-01-01&to=2026-03-02"],
    ["a range that ends in the future", "?to=2999-01-01"],
    ["an unknown parameter", "?color=blue"],
  ])("rejects %s with 400", async (_name, query) => {
    const f = await createListFor(world);
    const res = await get(f.listId, world.owner, query);
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });
});

describe("the metrics of a space", () => {
  it("add up its lists and group them by category", async () => {
    const f = await seedWorld();
    // A second list in the same space, with one finished task.
    const other = await db.list.create({
      data: {
        spaceId: f.spaceId,
        name: "Second",
        columns: {
          create: [
            { name: "Backlog", position: 0, category: "BACKLOG" },
            {
              name: "Working",
              position: 1,
              category: "ACTIVE",
              isCommitmentPoint: true,
            },
            { name: "Finished", position: 2, category: "DONE" },
            { name: "Dropped", position: 3, category: "DISCARDED" },
          ],
        },
      },
    });
    await addTask(
      f,
      "S",
      [
        ["CREATED", at("03"), "Backlog"],
        ["MOVED", at("04"), "Working"],
        ["MOVED", at("07"), "Finished"],
      ],
      { listId: other.id },
    );

    const m = await getSpaceMetrics(world.owner.id, f.spaceId, RANGE, NOW);
    expect(m.scope).toBe("space");
    expect(m.throughput.total).toBe(3); // A, B and S
    expect(m.cycleTime).toEqual({ count: 3, p50: 3, p85: 4, p95: 4 }); // 3, 4 and 3 days
    expect(m.wip.total).toBe(1);
    const last = m.cfd.days.length - 1;
    const band = (category: string) =>
      m.cfd.series.find((s) => s.bucket === category)!.counts[last];
    expect([
      band("BACKLOG"),
      band("ACTIVE"),
      band("DONE"),
      band("DISCARDED"),
    ]).toEqual([1, 1, 3, 1]);
    expect(m.cfd.series.map((s) => s.bucket)).toEqual([
      "BACKLOG",
      "ACTIVE",
      "DONE",
      "DISCARDED",
    ]);
  });

  it("are readable by anyone who sees the space, and hidden otherwise", async () => {
    const open = await createListFor(world);
    const hidden = await createListFor(world, { privateSpace: true });
    const get = (spaceId: string, actor: Actor | null) =>
      callAs(
        actor,
        spaceMetricsRoute.GET,
        req(
          "GET",
          `/api/spaces/${spaceId}/metrics?from=2026-03-02&to=2026-03-15`,
        ),
        { spaceId },
      );
    expect((await get(open.spaceId, world.guest)).status).toBe(200); // listed in the general space
    expect((await get(hidden.spaceId, world.member)).status).toBe(404);
    expect((await get(hidden.spaceId, world.admin)).status).toBe(200);
    expect((await get(open.spaceId, world.stranger)).status).toBe(404);
    expect((await get(open.spaceId, null)).status).toBe(401);
  });
});

describe("parseMetricsQuery", () => {
  it("accepts a range that ends today and one of exactly 366 days", () => {
    const today = new Date(NOW).toISOString().slice(0, 10);
    expect(() => parseMetricsQuery({ to: today }, NOW)).not.toThrow();
    expect(() =>
      parseMetricsQuery({ from: "2025-03-16", to: "2026-03-16" }, NOW),
    ).not.toThrow();
    expect(() =>
      parseMetricsQuery({ from: "2025-03-15", to: "2026-03-16" }, NOW),
    ).toThrow();
  });
});
