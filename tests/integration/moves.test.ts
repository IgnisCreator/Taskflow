import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { moveTask as modelMove } from "@/lib/board-order";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import {
  createProjectFor,
  createWorld,
  snapshot,
  type World,
} from "../helpers/world";

const { db } = await import("@/server/db");
const moveRoute =
  await import("@/app/api/projects/[projectId]/tasks/[taskId]/move/route");
const versionRoute =
  await import("@/app/api/projects/[projectId]/version/route");

const BASE = "http://localhost:3000";
const HEADERS = { origin: BASE, "content-type": "application/json" };

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

const move = (
  projectId: string,
  taskId: string,
  body: object,
  actor: Actor | null = world.owner,
) =>
  callAs(
    actor,
    moveRoute.PATCH,
    new Request(`${BASE}/api/projects/${projectId}/tasks/${taskId}/move`, {
      method: "PATCH",
      headers: HEADERS,
      body: JSON.stringify(body),
    }),
    { projectId, taskId },
  );

/** A project whose four columns hold `counts` tasks each (the fixture task is removed first). */
async function seed(counts: number[]) {
  const { projectId, taskId } = await createProjectFor(world);
  await db.task.delete({ where: { id: taskId } });
  const columns = await db.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
  for (const [i, column] of columns.entries()) {
    await db.task.createMany({
      data: Array.from({ length: counts[i]! }, (_, p) => ({
        projectId,
        columnId: column.id,
        title: `c${i}-t${p}`,
        position: p,
        createdById: world.owner.id,
      })),
    });
  }
  return projectId;
}

async function readBoard(projectId: string) {
  const columns = await db.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
    select: {
      id: true,
      tasks: {
        orderBy: { position: "asc" },
        select: { id: true, position: true },
      },
    },
  });
  return columns;
}

const orderOf = (columns: Awaited<ReturnType<typeof readBoard>>) =>
  columns.map((c) => c.tasks.map((t) => t.id));

const version = async (projectId: string) =>
  (await db.project.findUniqueOrThrow({ where: { id: projectId } }))
    .boardVersion;

describe("moving a task", () => {
  it("reorders inside a column and closes no gaps", async () => {
    const projectId = await seed([4, 0, 0, 0]);
    const [col] = await readBoard(projectId);
    const [a, b, c, d] = col!.tasks.map((t) => t.id);

    // a: first -> last
    let res = await move(projectId, a!, {
      columnId: col!.id,
      toIndex: 3,
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(200);
    expect((await res.json()).boardVersion).toBe(1);
    expect(orderOf(await readBoard(projectId))[0]).toEqual([b, c, d, a]);

    // a: last -> first
    res = await move(projectId, a!, {
      columnId: col!.id,
      toIndex: 0,
      expectedBoardVersion: 1,
    });
    expect(res.status).toBe(200);
    expect(orderOf(await readBoard(projectId))[0]).toEqual([a, b, c, d]);
  });

  it("moves to another column at the start, the middle, the end and into an empty one", async () => {
    const projectId = await seed([3, 2, 0, 0]);
    let [c0, c1, c2] = await readBoard(projectId);
    const [x, y, z] = c0!.tasks.map((t) => t.id);
    const [p, q] = c1!.tasks.map((t) => t.id);

    const steps: [string, string, number, string[][]][] = [
      [x!, c1!.id, 0, [[y!, z!], [x!, p!, q!], [], []]],
      [y!, c1!.id, 2, [[z!], [x!, p!, y!, q!], [], []]],
      [z!, c1!.id, 4, [[], [x!, p!, y!, q!, z!], [], []]],
      [p!, c2!.id, 0, [[], [x!, y!, q!, z!], [p!], []]],
    ];
    let v = 0;
    for (const [taskId, columnId, toIndex, expected] of steps) {
      const res = await move(projectId, taskId, {
        columnId,
        toIndex,
        expectedBoardVersion: v,
      });
      expect(res.status).toBe(200);
      v = (await res.json()).boardVersion;
      expect(
        orderOf(await readBoard(projectId)).slice(0, expected.length),
      ).toEqual(expected);
    }
    [c0, c1, c2] = await readBoard(projectId);
    expect(c0!.tasks).toHaveLength(0);
  });

  it("changes nothing, and does not raise the version, when the task stays where it is", async () => {
    const projectId = await seed([3, 0, 0, 0]);
    const [col] = await readBoard(projectId);
    const before = await snapshot(projectId);

    const res = await move(projectId, col!.tasks[1]!.id, {
      columnId: col!.id,
      toIndex: 1,
      expectedBoardVersion: 0,
    });

    expect(res.status).toBe(200);
    expect((await res.json()).boardVersion).toBe(0);
    expect(await snapshot(projectId)).toBe(before);
  });

  it("keeps the board identical to a pure model over 60 random moves", async () => {
    const projectId = await seed([4, 3, 0, 2]);
    let model = (await readBoard(projectId)).map((c) => ({
      id: c.id,
      tasks: c.tasks.map((t) => ({ id: t.id })),
    }));
    let seed32 = 20261009;
    const random = (max: number) => {
      seed32 = (seed32 + 0x6d2b79f5) | 0;
      let t = Math.imul(seed32 ^ (seed32 >>> 15), 1 | seed32);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * max);
    };

    let expectedVersion = 0;
    for (let i = 0; i < 60; i++) {
      const all = model.flatMap((c) => c.tasks.map((t) => t.id));
      const taskId = all[random(all.length)]!;
      const target = model[random(model.length)]!;
      const others = target.tasks.filter((t) => t.id !== taskId).length;
      const toIndex = random(others + 1);

      const next = modelMove(model, taskId, target.id, toIndex)!;
      const res = await move(projectId, taskId, {
        columnId: target.id,
        toIndex,
        expectedBoardVersion: expectedVersion,
      });
      expect(res.status, `move ${i}`).toBe(200);
      if (next !== model) expectedVersion += 1;
      model = next;

      const stored = await readBoard(projectId);
      expect(orderOf(stored), `order after move ${i}`).toEqual(
        model.map((c) => c.tasks.map((t) => t.id)),
      );
      for (const column of stored) {
        expect(column.tasks.map((t) => t.position)).toEqual(
          column.tasks.map((_, index) => index),
        );
      }
      expect(await version(projectId), `version after move ${i}`).toBe(
        expectedVersion,
      );
    }
  });
});

describe("rejected moves leave the board untouched", () => {
  it.each([
    [
      "an index past the end of the column",
      { toIndex: 99 },
      400,
      "INVALID_POSITION",
    ],
    [
      "the first index past the end of its own column",
      { toIndex: 3 },
      400,
      "INVALID_POSITION",
    ],
    ["a negative index", { toIndex: -1 }, 400, "VALIDATION_ERROR"],
    ["a fractional index", { toIndex: 0.5 }, 400, "VALIDATION_ERROR"],
    [
      "an unexpected field",
      { toIndex: 0, position: 3 },
      400,
      "VALIDATION_ERROR",
    ],
  ])("%s", async (_label, extra, status, code) => {
    const projectId = await seed([3, 1, 0, 0]);
    const [c0] = await readBoard(projectId);
    const before = await snapshot(projectId);

    const res = await move(projectId, c0!.tasks[0]!.id, {
      columnId: c0!.id,
      expectedBoardVersion: 0,
      ...extra,
    });

    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
    expect(await snapshot(projectId)).toBe(before);
  });

  it("rejects the first index past the end of another column, but accepts the last valid one", async () => {
    const projectId = await seed([3, 1, 0, 0]);
    const [c0, c1] = await readBoard(projectId);
    const before = await snapshot(projectId);

    const past = await move(projectId, c0!.tasks[0]!.id, {
      columnId: c1!.id,
      toIndex: 2, // column 1 has one task, so 0 and 1 are valid
      expectedBoardVersion: 0,
    });
    expect(past.status).toBe(400);
    expect((await past.json()).error.code).toBe("INVALID_POSITION");
    expect(await snapshot(projectId)).toBe(before);

    const last = await move(projectId, c0!.tasks[0]!.id, {
      columnId: c1!.id,
      toIndex: 1,
      expectedBoardVersion: 0,
    });
    expect(last.status).toBe(200);
  });

  it("refuses a column of another project and a task of another project", async () => {
    const mine = await seed([2, 0, 0, 0]);
    const other = await seed([2, 0, 0, 0]);
    const [myCol] = await readBoard(mine);
    const [otherCol] = await readBoard(other);
    const beforeMine = await snapshot(mine);
    const beforeOther = await snapshot(other);

    const wrongColumn = await move(mine, myCol!.tasks[0]!.id, {
      columnId: otherCol!.id,
      toIndex: 0,
      expectedBoardVersion: 0,
    });
    expect(wrongColumn.status).toBe(400);
    expect((await wrongColumn.json()).error.code).toBe("INVALID_COLUMN");

    const wrongTask = await move(mine, otherCol!.tasks[0]!.id, {
      columnId: myCol!.id,
      toIndex: 0,
      expectedBoardVersion: 0,
    });
    expect(wrongTask.status).toBe(404);

    expect(await snapshot(mine)).toBe(beforeMine);
    expect(await snapshot(other)).toBe(beforeOther);
  });

  it("refuses a stale version with 409 and the current one in the answer", async () => {
    const projectId = await seed([2, 0, 0, 0]);
    await db.project.update({
      where: { id: projectId },
      data: { boardVersion: 4 },
    });
    const [c0] = await readBoard(projectId);
    const before = await snapshot(projectId);

    const res = await move(projectId, c0!.tasks[0]!.id, {
      columnId: c0!.id,
      toIndex: 1,
      expectedBoardVersion: 1,
    });

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "BOARD_CONFLICT",
      currentVersion: 4,
    });
    expect(await snapshot(projectId)).toBe(before);
  });
});

describe("two moves with the same version", () => {
  it("lets exactly one win; the other gets 409, and the order stays valid", async () => {
    const projectId = await seed([3, 3, 0, 0]);
    const [c0, c1] = await readBoard(projectId);

    const [byOwner, byMember] = await Promise.all([
      move(projectId, c0!.tasks[0]!.id, {
        columnId: c1!.id,
        toIndex: 0,
        expectedBoardVersion: 0,
      }),
      move(
        projectId,
        c1!.tasks[0]!.id,
        { columnId: c0!.id, toIndex: 0, expectedBoardVersion: 0 },
        world.member,
      ),
    ]);

    expect([byOwner.status, byMember.status].sort()).toEqual([200, 409]);
    expect(await version(projectId)).toBe(1);
    for (const column of await readBoard(projectId)) {
      expect(column.tasks.map((t) => t.position)).toEqual(
        column.tasks.map((_, i) => i),
      );
    }
    expect((await readBoard(projectId)).flatMap((c) => c.tasks)).toHaveLength(
      6,
    );
  });
});

describe("the version endpoint", () => {
  const read = (projectId: string, actor: Actor | null) =>
    callAs(
      actor,
      versionRoute.GET,
      new Request(`${BASE}/api/projects/${projectId}/version`),
      {
        projectId,
      },
    );

  it("returns the current version to members only, uncached", async () => {
    const projectId = await seed([1, 0, 0, 0]);
    await db.project.update({
      where: { id: projectId },
      data: { boardVersion: 7 },
    });

    const ok = await read(projectId, world.viewer);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toEqual({ boardVersion: 7 });
    expect(ok.headers.get("cache-control")).toContain("no-store");

    expect((await read(projectId, world.stranger)).status).toBe(404);
    expect((await read(projectId, null)).status).toBe(401);
  });
});
