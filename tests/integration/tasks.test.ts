import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import {
  createProjectFor,
  createWorld,
  snapshot,
  type World,
} from "../helpers/world";

const { db } = await import("@/server/db");
const boardRoute = await import("@/app/api/projects/[projectId]/board/route");
const tasksRoute = await import("@/app/api/projects/[projectId]/tasks/route");
const taskRoute =
  await import("@/app/api/projects/[projectId]/tasks/[taskId]/route");

const BASE = "http://localhost:3000";
const HEADERS = { origin: BASE, "content-type": "application/json" };
const href = (projectId: string, tail = "") =>
  `${BASE}/api/projects/${projectId}${tail}`;
const req = (method: string, url: string, body?: object) =>
  new Request(url, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

const firstColumn = async (projectId: string, position = 0) =>
  (await db.boardColumn.findFirstOrThrow({ where: { projectId, position } }))
    .id;

const create = (
  projectId: string,
  body: object,
  actor: Actor | null = world.owner,
) =>
  callAs(actor, tasksRoute.POST, req("POST", href(projectId, "/tasks"), body), {
    projectId,
  });

const patch = (
  projectId: string,
  taskId: string,
  body: object,
  actor: Actor | null = world.owner,
) =>
  callAs(
    actor,
    taskRoute.PATCH,
    req("PATCH", href(projectId, `/tasks/${taskId}`), body),
    { projectId, taskId },
  );

const remove = (
  projectId: string,
  taskId: string,
  version: number,
  actor: Actor | null = world.owner,
) =>
  callAs(
    actor,
    taskRoute.DELETE,
    req("DELETE", href(projectId, `/tasks/${taskId}`), {
      expectedBoardVersion: version,
    }),
    { projectId, taskId },
  );

const draft = (columnId: string, extra: object = {}) => ({
  id: crypto.randomUUID(),
  columnId,
  title: "Write the report",
  expectedBoardVersion: 0,
  ...extra,
});

describe("creating a task", () => {
  it("adds it at the end of its column and records the author", async () => {
    const { projectId } = await createProjectFor(world); // one task already in column 0
    const columnId = await firstColumn(projectId);

    const res = await create(
      projectId,
      draft(columnId, { title: "  Second  ", priority: "HIGH" }),
    );
    expect(res.status).toBe(201);
    const { task, boardVersion } = await res.json();
    expect(task).toMatchObject({
      title: "Second",
      description: null,
      priority: "HIGH",
      assigneeId: null,
      dueDate: null,
      position: 1,
      createdById: world.owner.id,
      columnId,
    });
    expect(boardVersion).toBe(1);

    const other = await create(
      projectId,
      draft(columnId, { expectedBoardVersion: 1 }),
      world.member,
    );
    expect((await other.json()).task.position).toBe(2);
  });

  it("defaults the priority to MEDIUM", async () => {
    const { projectId } = await createProjectFor(world);
    const res = await create(projectId, draft(await firstColumn(projectId, 1)));
    expect((await res.json()).task.priority).toBe("MEDIUM");
  });

  it("is safe to retry: the same id gives 200 and a single row, even with a stale version", async () => {
    const { projectId } = await createProjectFor(world);
    const body = draft(await firstColumn(projectId));

    const first = await create(projectId, body);
    expect(first.status).toBe(201);
    const replay = await create(projectId, body); // version 0 is now stale
    expect(replay.status).toBe(200);
    expect((await replay.json()).task.id).toBe(body.id);

    expect(await db.task.count({ where: { id: body.id } })).toBe(1);
    const project = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(project.boardVersion).toBe(1);
  });

  it("creates only one task when the same request is sent twice at once", async () => {
    const { projectId } = await createProjectFor(world);
    const body = draft(await firstColumn(projectId));

    const [a, b] = await Promise.all([
      create(projectId, body),
      create(projectId, body),
    ]);

    const statuses = [a.status, b.status].sort();
    expect([
      [200, 201],
      [201, 409],
    ]).toContainEqual(statuses);
    expect(await db.task.count({ where: { id: body.id } })).toBe(1);
  });

  it("does not reveal or take over a task id from another project", async () => {
    const mine = await createProjectFor(world);
    const other = await createProjectFor(world);
    const foreign = await db.task.findFirstOrThrow({
      where: { projectId: other.projectId },
    });
    const before = await snapshot(mine.projectId);

    const res = await create(
      mine.projectId,
      draft(await firstColumn(mine.projectId), { id: foreign.id }),
    );

    expect(res.status).toBe(404);
    expect(await snapshot(mine.projectId)).toBe(before);
  });

  it.each([
    ["a title over 160 characters", { title: "x".repeat(161) }, 400],
    ["an empty title", { title: "  " }, 400],
    [
      "a description over 5000 characters",
      { description: "x".repeat(5001) },
      400,
    ],
    ["an invalid priority", { priority: "URGENT" }, 400],
    ["a date that does not exist", { dueDate: "2026-02-30" }, 400],
    ["a month that does not exist", { dueDate: "2026-13-01" }, 400],
    ["a date in the wrong format", { dueDate: "01/03/2026" }, 400],
    ["a client-chosen author", { createdById: "someone" }, 400],
    ["a client-chosen position", { position: 0 }, 400],
    ["a client-chosen project", { projectId: "x" }, 400],
    ["an id that is not a UUID", { id: "task-1" }, 400],
  ])("rejects %s", async (_label, extra, status) => {
    const { projectId } = await createProjectFor(world);
    const before = await snapshot(projectId);
    const res = await create(
      projectId,
      draft(await firstColumn(projectId), extra),
    );
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
    expect(await snapshot(projectId)).toBe(before);
  });

  it("rejects a column that belongs to another project", async () => {
    const mine = await createProjectFor(world);
    const other = await createProjectFor(world);
    const before = await snapshot(mine.projectId);

    const res = await create(
      mine.projectId,
      draft(await firstColumn(other.projectId)),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_COLUMN");
    expect(await snapshot(mine.projectId)).toBe(before);
  });

  it("rejects an assignee who is not a member of the project", async () => {
    const { projectId } = await createProjectFor(world);
    const before = await snapshot(projectId);

    const res = await create(
      projectId,
      draft(await firstColumn(projectId), { assigneeId: world.stranger.id }),
    );

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_ASSIGNEE");
    expect(await snapshot(projectId)).toBe(before);
  });

  it("stops at 200 tasks", async () => {
    const { projectId } = await createProjectFor(world); // 1 task
    const columnId = await firstColumn(projectId, 3);
    await db.task.createMany({
      data: Array.from({ length: 199 }, (_, i) => ({
        projectId,
        columnId,
        title: `Bulk ${i}`,
        position: i,
        createdById: world.owner.id,
      })),
    });

    const res = await create(projectId, draft(await firstColumn(projectId)));

    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
    expect(await db.task.count({ where: { projectId } })).toBe(200);
  });
});

describe("due dates", () => {
  // Calendar dates must read back identically whatever the server's time zone is.
  it.each(["UTC", "America/Santiago", "Pacific/Kiritimati"])(
    "keep their day in the %s time zone",
    async (zone) => {
      const original = process.env.TZ;
      process.env.TZ = zone;
      try {
        const { projectId } = await createProjectFor(world);
        const columnId = await firstColumn(projectId);

        const res = await create(
          projectId,
          draft(columnId, { dueDate: "2026-03-01" }),
        );
        const { task } = await res.json();
        expect(task.dueDate).toBe("2026-03-01");

        const saved = await db.$queryRaw<{ d: string }[]>`
          SELECT to_char("dueDate", 'YYYY-MM-DD') AS d FROM "Task" WHERE id = ${task.id}`;
        expect(saved[0]?.d).toBe("2026-03-01");

        const edited = await patch(projectId, task.id, {
          dueDate: "2026-12-31",
          expectedBoardVersion: 1,
        });
        expect((await edited.json()).task.dueDate).toBe("2026-12-31");

        const board = await (
          await callAs(
            world.owner,
            boardRoute.GET,
            req("GET", href(projectId, "/board")),
            { projectId },
          )
        ).json();
        const onBoard = board.columns[0].tasks.find(
          (t: { id: string }) => t.id === task.id,
        );
        expect(onBoard.dueDate).toBe("2026-12-31");
      } finally {
        if (original === undefined) delete process.env.TZ;
        else process.env.TZ = original;
      }
    },
  );
});

describe("editing a task", () => {
  it("changes only the given fields, can assign a member and clear the date", async () => {
    const { projectId, taskId } = await createProjectFor(world);

    const res = await patch(projectId, taskId, {
      title: "Renamed",
      priority: "LOW",
      assigneeId: world.viewer.id,
      dueDate: "2026-05-20",
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(200);
    const { task, boardVersion } = await res.json();
    expect(task).toMatchObject({
      title: "Renamed",
      priority: "LOW",
      assigneeId: world.viewer.id,
      dueDate: "2026-05-20",
      position: 0,
    });
    expect(boardVersion).toBe(1);

    const cleared = await patch(projectId, taskId, {
      assigneeId: null,
      dueDate: null,
      description: "   ",
      expectedBoardVersion: 1,
    });
    expect((await cleared.json()).task).toMatchObject({
      title: "Renamed",
      assigneeId: null,
      dueDate: null,
      description: null,
    });
  });

  it.each([
    ["nothing to change", {}],
    ["a column change", { columnId: "x" }],
    ["a position change", { position: 3 }],
    ["a different project", { projectId: "x" }],
    ["a different author", { createdById: "x" }],
  ])("rejects %s", async (_label, extra) => {
    const { projectId, taskId } = await createProjectFor(world);
    const before = await snapshot(projectId);
    const res = await patch(projectId, taskId, {
      ...extra,
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(400);
    expect(await snapshot(projectId)).toBe(before);
  });

  it("rejects an assignee outside the project", async () => {
    const { projectId, taskId } = await createProjectFor(world);
    const before = await snapshot(projectId);
    const res = await patch(projectId, taskId, {
      assigneeId: world.stranger.id,
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_ASSIGNEE");
    expect(await snapshot(projectId)).toBe(before);
  });

  it("answers 404 for a task of another project, even when the caller is in both", async () => {
    const a = await createProjectFor(world);
    const b = await createProjectFor(world);
    const before = await snapshot(b.projectId);

    const res = await patch(a.projectId, b.taskId, {
      title: "Hijacked",
      expectedBoardVersion: 0,
    });

    expect(res.status).toBe(404);
    expect(await snapshot(b.projectId)).toBe(before);
    expect(
      (await db.task.findUniqueOrThrow({ where: { id: b.taskId } })).title,
    ).not.toBe("Hijacked");
  });

  it("refuses a stale version with 409 and changes nothing", async () => {
    const { projectId, taskId } = await createProjectFor(world);
    const before = await snapshot(projectId);
    const res = await patch(projectId, taskId, {
      title: "Late",
      expectedBoardVersion: 9,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "BOARD_CONFLICT",
      currentVersion: 0,
    });
    expect(await snapshot(projectId)).toBe(before);
  });
});

describe("deleting a task", () => {
  it("removes it and closes the gap in its column", async () => {
    const { projectId } = await createProjectFor(world); // position 0 exists
    const columnId = await firstColumn(projectId);
    const ids: string[] = [];
    let version = 0;
    for (const title of ["B", "C", "D"]) {
      const res = await create(
        projectId,
        draft(columnId, { title, expectedBoardVersion: version }),
      );
      const { task, boardVersion } = await res.json();
      ids.push(task.id);
      version = boardVersion;
    }
    // positions: fixture 0, B 1, C 2, D 3 -> delete B

    const res = await remove(projectId, ids[0]!, version);
    expect(res.status).toBe(204);

    const left = await db.task.findMany({
      where: { projectId, columnId },
      orderBy: { position: "asc" },
      select: { title: true, position: true },
    });
    expect(left.map((t) => [t.position, t.title])).toEqual([
      [0, "Assigned to member"],
      [1, "C"],
      [2, "D"],
    ]);
  });

  it("does not move tasks in other columns", async () => {
    const { projectId, taskId } = await createProjectFor(world);
    const other = await create(
      projectId,
      draft(await firstColumn(projectId, 1)),
    );
    const otherTask = (await other.json()).task;

    expect((await remove(projectId, taskId, 1)).status).toBe(204);

    const row = await db.task.findUniqueOrThrow({
      where: { id: otherTask.id },
    });
    expect(row.position).toBe(0);
  });

  it("answers 404 for a task of another project and 409 for a stale version", async () => {
    const a = await createProjectFor(world);
    const b = await createProjectFor(world);

    expect((await remove(a.projectId, b.taskId, 0)).status).toBe(404);
    expect(await db.task.count({ where: { id: b.taskId } })).toBe(1);

    const stale = await remove(a.projectId, a.taskId, 5);
    expect(stale.status).toBe(409);
    expect(await db.task.count({ where: { id: a.taskId } })).toBe(1);
  });
});

describe("the board snapshot", () => {
  it("returns ordered columns, ordered tasks, members and the version together", async () => {
    const { projectId } = await createProjectFor(world);
    const col1 = await firstColumn(projectId, 1);
    await create(projectId, draft(col1, { title: "In progress A" }));
    await create(
      projectId,
      draft(col1, { title: "In progress B", expectedBoardVersion: 1 }),
    );

    const res = await callAs(
      world.viewer,
      boardRoute.GET,
      req("GET", href(projectId, "/board")),
      { projectId },
    );
    expect(res.status).toBe(200);
    const board = await res.json();

    expect(board.project).toMatchObject({
      id: projectId,
      boardVersion: 2,
      role: "VIEWER",
      isOwner: false,
    });
    expect(board.columns.map((c: { name: string }) => c.name)).toEqual([
      "To do",
      "In progress",
      "In review",
      "Done",
    ]);
    expect(
      board.columns[1].tasks.map((t: { title: string }) => t.title),
    ).toEqual(["In progress A", "In progress B"]);
    expect(board.members.map((m: { role: string }) => m.role).sort()).toEqual([
      "ADMIN",
      "ADMIN",
      "MEMBER",
      "VIEWER",
    ]);
    expect(JSON.stringify(board)).not.toMatch(/@example\.test|publicId|token/i);
  });
});
