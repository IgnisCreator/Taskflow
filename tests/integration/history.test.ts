import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import {
  createListFor,
  createWorld,
  snapshotList,
  type World,
} from "../helpers/world";

const { db } = await import("@/server/db");
const tasksRoute = await import("@/app/api/lists/[listId]/tasks/route");
const taskRoute = await import("@/app/api/lists/[listId]/tasks/[taskId]/route");
const moveRoute =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/move/route");
const flowRoute = await import("@/app/api/lists/[listId]/flow/route");
const activityRoute = await import("@/app/api/lists/[listId]/activity/route");

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

/** A list with one task in "To do"; helpers act on it and read its history. */
async function setUp() {
  const fixture = await createListFor(world);
  const stages = await db.boardColumn.findMany({
    where: { listId: fixture.listId },
    orderBy: { position: "asc" },
  });
  const by = Object.fromEntries(stages.map((s) => [s.name, s.id])) as Record<
    string,
    string
  >;
  const { listId, taskId } = fixture;
  return {
    ...fixture,
    by,
    move: (
      columnId: string,
      toIndex: number,
      version: number,
      actor: Actor = world.owner,
      id = taskId,
    ) =>
      callAs(
        actor,
        moveRoute.PATCH,
        req("PATCH", `/api/lists/${listId}/tasks/${id}/move`, {
          columnId,
          toIndex,
          expectedBoardVersion: version,
        }),
        { listId, taskId: id },
      ),
    patch: (body: object, actor: Actor = world.owner) =>
      callAs(
        actor,
        taskRoute.PATCH,
        req("PATCH", `/api/lists/${listId}/tasks/${taskId}`, body),
        {
          listId,
          taskId,
        },
      ),
    events: (id = taskId) =>
      db.taskEvent.findMany({
        where: { taskId: id },
        orderBy: [{ at: "asc" }, { id: "asc" }],
      }),
  };
}

const kinds = (events: { type: string }[]) => events.map((e) => e.type);

describe("creating a task", () => {
  it("records CREATED with the stage and its category, once, even when the request is repeated", async () => {
    const s = await setUp();
    const id = crypto.randomUUID();
    const body = {
      id,
      columnId: s.by["In progress"],
      title: "New",
      expectedBoardVersion: 0,
    };
    const send = () =>
      callAs(
        world.member,
        tasksRoute.POST,
        req("POST", `/api/lists/${s.listId}/tasks`, body),
        {
          listId: s.listId,
        },
      );

    expect((await send()).status).toBe(201);
    expect((await send()).status).toBe(200); // the replay answers with the same task

    const events = await s.events(id);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: "CREATED",
      listId: s.listId,
      toStageId: s.by["In progress"],
      toCategory: "ACTIVE",
      fromStageId: null,
      fromCategory: null,
      actorId: world.member.id,
    });
  });
});

describe("moving a task", () => {
  it("records MOVED, DISCARDED and REOPENED by the categories involved", async () => {
    const s = await setUp();
    expect((await s.move(s.by["In progress"]!, 0, 0)).status).toBe(200);
    expect((await s.move(s.by["Done"]!, 0, 1)).status).toBe(200);
    expect((await s.move(s.by["In progress"]!, 0, 2)).status).toBe(200); // out of done: reopened
    expect((await s.move(s.by["Discarded"]!, 0, 3)).status).toBe(200);
    expect((await s.move(s.by["To do"]!, 0, 4)).status).toBe(200); // out of discarded: reopened

    const events = await s.events();
    expect(kinds(events)).toEqual([
      "MOVED",
      "MOVED",
      "REOPENED",
      "DISCARDED",
      "REOPENED",
    ]);
    expect(events.map((e) => [e.fromCategory, e.toCategory])).toEqual([
      ["BACKLOG", "ACTIVE"],
      ["ACTIVE", "DONE"],
      ["DONE", "ACTIVE"],
      ["ACTIVE", "DISCARDED"],
      ["DISCARDED", "BACKLOG"],
    ]);
    expect(events[0]).toMatchObject({
      fromStageId: s.by["To do"],
      toStageId: s.by["In progress"],
      actorId: world.owner.id,
    });
  });

  it("leaves no event for reordering inside a stage, a no-op or a refused move", async () => {
    const s = await setUp();
    // Reorder: a second task in "To do", then put the fixture task last.
    await db.task.create({
      data: {
        listId: s.listId,
        columnId: s.by["To do"]!,
        title: "Other",
        position: 1,
        createdById: world.owner.id,
      },
    });
    expect((await s.move(s.by["To do"]!, 1, 0)).status).toBe(200);
    expect((await s.move(s.by["To do"]!, 1, 1)).status).toBe(200); // no-op: answers 200, changes nothing
    expect((await s.move(s.by["In progress"]!, 0, 99)).status).toBe(409); // stale version
    expect((await s.move(s.by["In progress"]!, 5, 1)).status).toBe(400); // out of range
    expect(await s.events()).toHaveLength(0);
  });

  it("records the move of a task by whoever moves it, member or admin", async () => {
    const s = await setUp();
    await s.move(s.by["In progress"]!, 0, 0, world.admin);
    await s.move(s.by["Done"]!, 0, 1, world.member);
    expect((await s.events()).map((e) => e.actorId)).toEqual([
      world.admin.id,
      world.member.id,
    ]);
  });
});

describe("blocking a task", () => {
  it("records BLOCKED and UNBLOCKED in the current stage, and nothing for other changes", async () => {
    const s = await setUp();
    await s.move(s.by["In progress"]!, 0, 0); // v1
    expect(
      (
        await s.patch({
          blockedReason: " Waiting for the API ",
          expectedBoardVersion: 1,
        })
      ).status,
    ).toBe(200);
    // Another reason, or an unrelated edit, is not history.
    expect(
      (
        await s.patch({
          blockedReason: "Waiting for the vendor",
          expectedBoardVersion: 2,
        })
      ).status,
    ).toBe(200);
    expect(
      (await s.patch({ title: "Renamed", expectedBoardVersion: 3 })).status,
    ).toBe(200);
    expect(
      (await s.patch({ blockedReason: null, expectedBoardVersion: 4 })).status,
    ).toBe(200);
    expect(
      (await s.patch({ blockedReason: null, expectedBoardVersion: 5 })).status,
    ).toBe(200); // already unblocked

    const events = await s.events();
    expect(kinds(events)).toEqual(["MOVED", "BLOCKED", "UNBLOCKED"]);
    expect(events[1]).toMatchObject({
      toStageId: s.by["In progress"],
      toCategory: "ACTIVE",
    });
    const task = await db.task.findUniqueOrThrow({ where: { id: s.taskId } });
    expect(task.blockedReason).toBeNull();
  });

  it("stores the trimmed reason, and rejects an empty or long one", async () => {
    const s = await setUp();
    expect(
      (
        await s.patch({
          blockedReason: "  Needs review  ",
          expectedBoardVersion: 0,
        })
      ).status,
    ).toBe(200);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: s.taskId } }))
        .blockedReason,
    ).toBe("Needs review");
    for (const blockedReason of ["   ", "x".repeat(301)]) {
      expect(
        (await s.patch({ blockedReason, expectedBoardVersion: 1 })).status,
      ).toBe(400);
    }
  });
});

describe("the history is part of the change", () => {
  it("keeps the category it was recorded with when the flow changes later", async () => {
    const s = await setUp();
    await s.move(s.by["In review"]!, 0, 0); // event to ACTIVE
    // "In review" becomes a waiting stage (the flow editor sends the whole flow).
    const stages = (
      await db.boardColumn.findMany({
        where: { listId: s.listId },
        orderBy: { position: "asc" },
      })
    ).map((c) => ({
      id: c.id,
      name: c.name,
      category: c.name === "In review" ? "WAITING" : c.category,
      wipLimit: c.wipLimit,
      policy: c.policy,
      isCommitmentPoint: c.isCommitmentPoint,
    }));
    const res = await callAs(
      world.owner,
      flowRoute.PUT,
      req("PUT", `/api/lists/${s.listId}/flow`, {
        expectedBoardVersion: 1,
        stages,
      }),
      {
        listId: s.listId,
      },
    );
    expect(res.status).toBe(200);
    expect((await s.events())[0]).toMatchObject({ toCategory: "ACTIVE" }); // not rewritten
  });

  it("is written when a removed stage sends its tasks elsewhere, and survives the stage", async () => {
    const s = await setUp();
    await s.move(s.by["In review"]!, 0, 0); // the task sits in "In review"
    const stages = (
      await db.boardColumn.findMany({
        where: { listId: s.listId },
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
    const doneIndex = stages.findIndex((x) => x.name === "Done");
    const res = await callAs(
      world.admin,
      flowRoute.PUT,
      req("PUT", `/api/lists/${s.listId}/flow`, {
        expectedBoardVersion: 1,
        stages,
        moveTo: { [s.by["In review"]!]: doneIndex },
      }),
      { listId: s.listId },
    );
    expect(res.status).toBe(200);

    const events = await s.events();
    expect(kinds(events)).toEqual(["MOVED", "MOVED"]);
    expect(events[1]).toMatchObject({
      fromCategory: "ACTIVE",
      toCategory: "DONE",
      toStageId: s.by["Done"],
      actorId: world.admin.id,
      fromStageId: null, // the stage is gone; its category stays
    });
  });

  it("is rolled back together with the change when writing the event fails", async () => {
    const s = await setUp();
    await db.$executeRawUnsafe(`
      CREATE FUNCTION tf_fail_events() RETURNS trigger AS $$
      BEGIN RAISE EXCEPTION 'injected failure'; END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(
      `CREATE TRIGGER tf_fail_events BEFORE INSERT ON "TaskEvent" FOR EACH ROW EXECUTE FUNCTION tf_fail_events()`,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const before = await snapshotList(s.listId);
      const res = await s.move(s.by["In progress"]!, 0, 0);
      expect(res.status).toBe(500);
      // The task did not move and the version did not go up: the whole change is gone.
      expect(await snapshotList(s.listId)).toBe(before);
    } finally {
      vi.restoreAllMocks();
      await db.$executeRawUnsafe(`DROP TRIGGER tf_fail_events ON "TaskEvent"`);
      await db.$executeRawUnsafe(`DROP FUNCTION tf_fail_events()`);
    }
  });
});

describe("the activity of a list", () => {
  const activity = (listId: string, actor: Actor | null, query = "") =>
    callAs(
      actor,
      activityRoute.GET,
      req("GET", `/api/lists/${listId}/activity${query}`),
      { listId },
    );

  it("lists events newest first with who and where, to anyone who can see the list", async () => {
    const s = await setUp();
    await s.move(s.by["In progress"]!, 0, 0, world.admin);
    await s.patch(
      { blockedReason: "Waiting", expectedBoardVersion: 1 },
      world.member,
    );

    const res = await activity(s.listId, world.guest);
    expect(res.status).toBe(200);
    const { items, nextCursor } = await res.json();
    expect(nextCursor).toBeNull();
    expect(items.map((e: { type: string }) => e.type)).toEqual([
      "BLOCKED",
      "MOVED",
    ]);
    expect(items[1]).toMatchObject({
      actor: "admin",
      task: { title: "Assigned to member" },
      fromStage: { name: "To do" },
      toStage: { name: "In progress" },
    });
    expect(JSON.stringify(items)).not.toMatch(/@example\.test|publicId/);
  });

  it("pages with a cursor, without repeating or skipping events", async () => {
    const s = await setUp();
    let version = 0;
    for (const target of [
      "In progress",
      "Done",
      "In progress",
      "Done",
      "In progress",
    ]) {
      await s.move(s.by[target]!, 0, version++);
    }
    const first = await (
      await activity(s.listId, world.owner, "?limit=2")
    ).json();
    const second = await (
      await activity(
        s.listId,
        world.owner,
        `?limit=2&cursor=${first.nextCursor}`,
      )
    ).json();
    const third = await (
      await activity(
        s.listId,
        world.owner,
        `?limit=2&cursor=${second.nextCursor}`,
      )
    ).json();
    const ids = [...first.items, ...second.items, ...third.items].map(
      (e: { id: string }) => e.id,
    );
    expect(ids).toHaveLength(5);
    expect(new Set(ids).size).toBe(5);
    expect(third.nextCursor).toBeNull();
    const all = (await s.events()).map((e) => e.id).reverse();
    expect(ids).toEqual(all);
  });

  it("answers 404 to a stranger, 401 to nobody and 400 to a bad page size", async () => {
    const s = await setUp();
    expect((await activity(s.listId, world.stranger)).status).toBe(404);
    expect((await activity(s.listId, null)).status).toBe(401);
    expect((await activity(s.listId, world.owner, "?limit=0")).status).toBe(
      400,
    );
    expect((await activity(s.listId, world.owner, "?limit=101")).status).toBe(
      400,
    );
  });
});
