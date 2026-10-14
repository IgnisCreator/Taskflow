import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const route = await import("@/app/api/lists/[listId]/forecast/route");
const { getListForecast } = await import("@/server/services/forecast");
const { parseForecastQuery } = await import("@/lib/validations/forecast");

const BASE = "http://localhost:3000";
const get = (listId: string, query = "") =>
  new Request(`${BASE}/api/lists/${listId}/forecast${query}`);

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

// March 2026 (UTC; the 2nd is a Monday). "Now" is Monday the 16th at noon, so tomorrow is Tuesday
// the 17th, and the history window below is the two weeks of the 2nd to the 15th.
const at = (day: string, time: string) =>
  new Date(`2026-03-${day}T${time}:00Z`);
const NOW = at("16", "12:00").getTime();
const WINDOW = "from=2026-03-02&to=2026-03-15";
const query = (extra = "") =>
  parseForecastQuery(
    Object.fromEntries(new URLSearchParams(`${WINDOW}&${extra}`)),
    NOW,
  );

type Fixture = Awaited<ReturnType<typeof createListFor>>;

async function stage(fixture: Fixture, name: string) {
  return db.boardColumn.findFirstOrThrow({
    where: { listId: fixture.listId, name },
  });
}

/** A task that went To do -> In progress -> Done on `day`, so it counts as finished that day. */
async function finishedOn(fixture: Fixture, title: string, day: string) {
  const [todo, doing, done] = await Promise.all(
    ["To do", "In progress", "Done"].map((n) => stage(fixture, n)),
  );
  const task = await db.task.create({
    data: {
      listId: fixture.listId,
      columnId: done!.id,
      title,
      position: await db.task.count({ where: { columnId: done!.id } }),
      createdById: world.owner.id,
    },
  });
  await db.taskEvent.createMany({
    data: (
      [
        ["CREATED", todo!, "08:00"],
        ["MOVED", doing!, "09:00"],
        ["MOVED", done!, "10:00"],
      ] as const
    ).map(([type, s, time]) => ({
      taskId: task.id,
      listId: fixture.listId,
      type,
      toStageId: s.id,
      toCategory: s.category,
      actorId: world.owner.id,
      at: at(day, time),
    })),
  });
}

async function pending(fixture: Fixture, names: [string, string][]) {
  for (const [title, stageName] of names) {
    const s = await stage(fixture, stageName);
    await db.task.create({
      data: {
        listId: fixture.listId,
        columnId: s.id,
        title,
        position: await db.task.count({ where: { columnId: s.id } }),
        createdById: world.owner.id,
      },
    });
  }
}

/** A list that finished exactly two tasks on each of the 14 days of the window. */
async function steadyList() {
  const fixture = await createListFor(world);
  await db.task.deleteMany({ where: { listId: fixture.listId } });
  for (let day = 2; day <= 15; day++) {
    const d = String(day).padStart(2, "0");
    await finishedOn(fixture, `A${d}`, d);
    await finishedOn(fixture, `B${d}`, d);
  }
  return fixture;
}

describe("a steady pace of two tasks a day has exact answers", () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await steadyList();
    await pending(fixture, [
      ["Todo 1", "To do"],
      ["Todo 2", "To do"],
      ["Todo 3", "To do"],
      ["Doing", "In progress"],
    ]);
  });
  const forecast = (extra: string, userId = world.owner.id) =>
    getListForecast(userId, fixture.listId, query(extra), NOW);

  it("ten tasks take five days at every confidence, counting from tomorrow", async () => {
    const f = await forecast("items=10");
    expect(f).toMatchObject({ question: "WHEN", items: 10, defaulted: false });
    expect(f.confidence).toEqual([
      { percent: 50, days: 5, date: "2026-03-21" },
      { percent: 85, days: 5, date: "2026-03-21" },
      { percent: 95, days: 5, date: "2026-03-21" },
    ]);
    expect(f.histogram).toEqual([{ from: 5, to: 5, count: 10_000 }]);
  });

  it("by default asks about the pending tasks: to do, active and waiting, not the finished", async () => {
    const f = await forecast("");
    expect(f).toMatchObject({ pending: 4, items: 4, defaulted: true });
    expect(f.confidence.map((c) => "days" in c && c.days)).toEqual([2, 2, 2]);
  });

  it("with working days only, the dates skip the weekend", async () => {
    // Tomorrow is a Tuesday: five working days end on Monday the 23rd.
    const f = await forecast("items=10&workdays=1");
    expect(f.workdaysOnly).toBe(true);
    expect(f.confidence.map((c) => "date" in c && c.date)).toEqual([
      "2026-03-23",
      "2026-03-23",
      "2026-03-23",
    ]);
    // Through the weekend the calendar-day answer is the 21st.
    const all = await forecast("items=10");
    expect("date" in all.confidence[0]! && all.confidence[0]!.date).toBe(
      "2026-03-21",
    );
  });

  it("how many by a date: seven days finish fourteen, at every confidence", async () => {
    const f = await forecast("date=2026-03-23");
    expect(f).toMatchObject({ question: "HOW_MANY", days: 7 });
    expect(f.confidence.map((c) => "count" in c && c.count)).toEqual([
      14, 14, 14,
    ]);
    const w = await forecast("date=2026-03-23&workdays=1");
    expect(w).toMatchObject({ days: 5 }); // Tue 17 to Mon 23, weekends skipped
    expect(w.confidence.map((c) => "count" in c && c.count)).toEqual([
      10, 10, 10,
    ]);
  });

  it("says which history it used, and the seed, so the answer can be reproduced", async () => {
    const f = await forecast("items=10&seed=99");
    expect(f.seed).toBe(99);
    expect(f.runs).toBe(10_000);
    expect(f.window).toEqual({
      from: "2026-03-02",
      to: "2026-03-15",
      days: 14,
      daysWithData: 14,
      finished: 28,
    });
    expect(f.warnings).toEqual([]);
  });

  it("anyone who can see the list can ask, a stranger cannot", async () => {
    for (const actor of [world.admin, world.member, world.guest]) {
      const res = await callAs(
        actor,
        route.GET,
        get(fixture.listId, `?${WINDOW}&items=3`),
        {
          listId: fixture.listId,
        },
      );
      expect(res.status).toBe(200);
    }
    const stranger = await callAs(
      world.stranger,
      route.GET,
      get(fixture.listId),
      {
        listId: fixture.listId,
      },
    );
    expect(stranger.status).toBe(404);
  });
});

describe("what a thin or empty history does", () => {
  it("shows the result and warns when there are few days with data", async () => {
    const fixture = await createListFor(world);
    await db.task.deleteMany({ where: { listId: fixture.listId } });
    for (const n of [1, 2, 3, 4]) await finishedOn(fixture, `Quick ${n}`, "10");
    const f = await getListForecast(
      world.owner.id,
      fixture.listId,
      query("items=4"),
      NOW,
    );
    expect(f.possible).toBe(true);
    expect(f.window).toMatchObject({ daysWithData: 1, finished: 4 });
    expect(f.warnings).toHaveLength(2);
    expect(f.warnings[0]).toContain("Only 1 days");
    expect(f.warnings[1]).toContain("Only 4 tasks");
    // Quiet days are part of the answer: with 4 finished on 1 of 14 days it takes longer than a day.
    const days = f.confidence.map((c) => ("days" in c ? c.days : null));
    expect(days.every((d) => d !== null && d > 1)).toBe(true);
  });

  it("the same seed gives the same answer and another seed another one", async () => {
    const fixture = await createListFor(world);
    await db.task.deleteMany({ where: { listId: fixture.listId } });
    for (const n of [1, 2, 3]) await finishedOn(fixture, `Few ${n}`, "10");
    const run = (seed: number) =>
      getListForecast(
        world.owner.id,
        fixture.listId,
        query(`items=6&seed=${seed}`),
        NOW,
      );
    expect(await run(5)).toEqual(await run(5));
    expect((await run(5)).histogram).not.toEqual((await run(6)).histogram);
  });

  it("an empty history gives no answer instead of a made-up one", async () => {
    const fixture = await createListFor(world);
    await db.task.deleteMany({ where: { listId: fixture.listId } });
    await pending(fixture, [["Waiting", "To do"]]);
    const f = await getListForecast(
      world.owner.id,
      fixture.listId,
      query(""),
      NOW,
    );
    expect(f).toMatchObject({ possible: false, items: 1, pending: 1 });
    expect(f.confidence.every((c) => "days" in c && c.days === null)).toBe(
      true,
    );
    expect(f.histogram).toEqual([]);
    expect(f.warnings).toHaveLength(2);
    const byDate = await getListForecast(
      world.owner.id,
      fixture.listId,
      query("date=2026-03-23"),
      NOW,
    );
    expect(byDate.possible).toBe(false);
    expect(
      byDate.confidence.every((c) => "count" in c && c.count === null),
    ).toBe(true);
  });

  it("with nothing pending it says so instead of an empty result", async () => {
    const fixture = await createListFor(world);
    await db.task.deleteMany({ where: { listId: fixture.listId } });
    await finishedOn(fixture, "Only one", "10");
    const f = await getListForecast(
      world.owner.id,
      fixture.listId,
      query(""),
      NOW,
    );
    expect(f).toMatchObject({
      question: "WHEN",
      nothingPending: true,
      items: 0,
    });
    expect(f.confidence).toEqual([]);
    // Asking for a number explicitly still works.
    const explicit = (await getListForecast(
      world.owner.id,
      fixture.listId,
      query("items=2"),
      NOW,
    )) as { nothingPending: boolean };
    expect(explicit.nothingPending).toBe(false);
  });

  it("discarded tasks are not pending", async () => {
    const fixture = await createListFor(world);
    await db.task.deleteMany({ where: { listId: fixture.listId } });
    await pending(fixture, [
      ["Dropped", "Discarded"],
      ["Open", "To do"],
    ]);
    const f = await getListForecast(
      world.owner.id,
      fixture.listId,
      query(""),
      NOW,
    );
    expect(f).toMatchObject({ pending: 1 });
  });
});

describe("the API", () => {
  let fixture: Fixture;
  beforeAll(async () => {
    fixture = await createListFor(world);
  });
  const call = (extra: string, actor = world.owner) =>
    callAs(actor, route.GET, get(fixture.listId, `?${extra}`), {
      listId: fixture.listId,
    });

  it("needs a session", async () => {
    const res = await callAs(null, route.GET, get(fixture.listId), {
      listId: fixture.listId,
    });
    expect(res.status).toBe(401);
  });

  it.each([
    "items=0",
    "items=1001",
    "items=2.5",
    "seed=-1",
    "seed=2147483648",
    "date=2020-01-01",
    "date=2099-01-01",
    "items=3&date=2099-01-01",
    "from=2026-03-10&to=2026-03-01",
    "workdays=yes",
    "nope=1",
  ])(
    "refuses %s with a 400 and a message, before any calculation",
    async (extra) => {
      const started = Date.now();
      const res = await call(extra);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error.code).toBe("VALIDATION_ERROR");
      expect(Date.now() - started).toBeLessThan(2000);
    },
  );

  it("answers a valid question with the settings it used", async () => {
    const res = await call(`${WINDOW}&items=5&seed=3`);
    // The route reads the real clock, so only the shape and the echoed settings are checked here.
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({
      question: "WHEN",
      seed: 3,
      items: 5,
      runs: 10_000,
    });
  });
});
