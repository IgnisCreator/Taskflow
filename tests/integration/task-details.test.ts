import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
const subtasksRoute =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/subtasks/route");
const subtaskRoute =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/subtasks/[subtaskId]/route");
const commentsRoute =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/comments/route");
const commentRoute =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/comments/[commentId]/route");
const boardRoute = await import("@/app/api/lists/[listId]/board/route");
const spaceMembersRoute =
  await import("@/app/api/spaces/[spaceId]/members/route");
const spaceMemberRoute =
  await import("@/app/api/spaces/[spaceId]/members/[userId]/route");
const spaceRoute = await import("@/app/api/spaces/[spaceId]/route");
const { getBoard } = await import("@/server/services/tasks");

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

const create = (listId: string, body: object, actor: Actor = world.owner) =>
  callAs(
    actor,
    tasksRoute.POST,
    req("POST", `/api/lists/${listId}/tasks`, body),
    { listId },
  );
const patch = (
  listId: string,
  taskId: string,
  body: object,
  actor: Actor = world.owner,
) =>
  callAs(
    actor,
    taskRoute.PATCH,
    req("PATCH", `/api/lists/${listId}/tasks/${taskId}`, body),
    {
      listId,
      taskId,
    },
  );
const firstStage = async (listId: string) =>
  (await db.boardColumn.findFirstOrThrow({ where: { listId, position: 0 } }))
    .id;
const draft = (columnId: string, extra: object = {}) => ({
  id: crypto.randomUUID(),
  columnId,
  title: "Task",
  expectedBoardVersion: 0,
  ...extra,
});

describe("assignees, type and labels", () => {
  it("a task can have several assignees, a type and labels, and they come back with it", async () => {
    const { listId, typeId, labelId } = await createListFor(world);
    const res = await create(
      listId,
      draft(await firstStage(listId), {
        assigneeIds: [world.member.id, world.admin.id],
        typeId,
        labelIds: [labelId],
      }),
    );
    expect(res.status).toBe(201);
    const { task } = await res.json();
    expect(task.assigneeIds.sort()).toEqual(
      [world.admin.id, world.member.id].sort(),
    );
    expect(task.type).toMatchObject({ id: typeId });
    expect(task.labels).toEqual([{ id: labelId, name: "urgent" }]);
    expect(task.subtasks).toEqual({ total: 0, done: 0 });

    const board = await (
      await callAs(
        world.guest,
        boardRoute.GET,
        req("GET", `/api/lists/${listId}/board`),
        { listId },
      )
    ).json();
    const found = board.columns[0].tasks.find(
      (t: { id: string }) => t.id === task.id,
    );
    expect(found.assigneeIds).toHaveLength(2);
  });

  it("editing replaces each set as a whole and can clear the type", async () => {
    const { listId, taskId, typeId, labelId } = await createListFor(world); // assigned to the member
    const res = await patch(listId, taskId, {
      assigneeIds: [world.admin.id, world.owner.id],
      labelIds: [labelId],
      typeId,
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(200);
    const first = (await res.json()).task;
    expect(first.assigneeIds.sort()).toEqual(
      [world.admin.id, world.owner.id].sort(),
    );
    expect(first.labels).toHaveLength(1);

    const cleared = await patch(listId, taskId, {
      assigneeIds: [],
      labelIds: [],
      typeId: null,
      expectedBoardVersion: 1,
    });
    expect((await cleared.json()).task).toMatchObject({
      assigneeIds: [],
      labels: [],
      type: null,
    });
  });

  it("an edit that does not mention them leaves them alone", async () => {
    const { listId, taskId } = await createListFor(world);
    const res = await patch(listId, taskId, {
      title: "Only the title",
      expectedBoardVersion: 0,
    });
    expect((await res.json()).task.assigneeIds).toEqual([world.member.id]);
  });

  it.each([
    [
      "a repeated assignee",
      (w: World) => ({ assigneeIds: [w.member.id, w.member.id] }),
      "VALIDATION_ERROR",
    ],
    [
      "more than ten assignees",
      () => ({ assigneeIds: Array.from({ length: 11 }, (_, i) => `u${i}`) }),
      "VALIDATION_ERROR",
    ],
    [
      "an assignee outside the workspace",
      (w: World) => ({ assigneeIds: [w.stranger.id] }),
      "INVALID_ASSIGNEE",
    ],
    ["a type that does not exist", () => ({ typeId: "nope" }), "INVALID_TYPE"],
    [
      "a label that does not exist",
      () => ({ labelIds: ["nope"] }),
      "INVALID_LABEL",
    ],
  ])("rejects %s and changes nothing", async (_name, extra, code) => {
    const { listId, taskId } = await createListFor(world);
    const before = await snapshotList(listId);
    const res = await patch(listId, taskId, {
      ...extra(world),
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(code);
    expect(await snapshotList(listId)).toBe(before);
  });

  it("refuses a type or a label of another workspace", async () => {
    const mine = await createListFor(world);
    const other = await createListFor(world);
    for (const extra of [
      { typeId: other.typeId },
      { labelIds: [other.labelId] },
    ]) {
      const res = await create(
        mine.listId,
        draft(await firstStage(mine.listId), extra),
      );
      expect(res.status).toBe(400);
    }
  });

  it("the assignee filter finds a task by any of its assignees, and 'none' only unassigned ones", async () => {
    const { listId, taskId } = await createListFor(world);
    await patch(listId, taskId, {
      assigneeIds: [world.member.id, world.admin.id],
      expectedBoardVersion: 0,
    });
    const names = async (assignee: string) =>
      (await getBoard(world.owner.id, listId, { assignee })).columns.flatMap(
        (c) => c.tasks.map((t) => t.title),
      );
    expect(await names(world.admin.id)).toEqual(["Assigned to member"]);
    expect(await names(world.member.id)).toEqual(["Assigned to member"]);
    expect(await names(world.owner.id)).toEqual([]);
    expect(await names("none")).toEqual([]);
  });
});

describe("who stays assigned", () => {
  it("nobody stays assigned to work they can no longer see", async () => {
    const { workspaceId, spaceId, listId, taskId } = await createListFor(world);
    // The space becomes private with the member listed: the assignment stays.
    await db.spaceMember.create({
      data: { spaceId, workspaceId, userId: world.member.id },
    });
    const makePrivate = await callAs(
      world.owner,
      spaceRoute.PATCH,
      req("PATCH", `/api/spaces/${spaceId}`, { isPrivate: true }),
      { spaceId },
    );
    expect(makePrivate.status).toBe(200);
    expect(
      await db.taskAssignee.count({
        where: { taskId, userId: world.member.id },
      }),
    ).toBe(1);

    // Unlisting the member takes them off the task.
    const res = await callAs(
      world.owner,
      spaceMemberRoute.DELETE,
      req("DELETE", `/api/spaces/${spaceId}/members/${world.member.id}`),
      { spaceId, userId: world.member.id },
    );
    expect(res.status).toBe(204);
    expect(await db.taskAssignee.count({ where: { taskId } })).toBe(0);
    expect(listId).toBeTruthy();
  });

  it("making a space private takes unlisted members off its tasks, but not admins", async () => {
    const { spaceId, listId, taskId } = await createListFor(world);
    await patch(listId, taskId, {
      assigneeIds: [world.member.id, world.admin.id],
      expectedBoardVersion: 0,
    });
    const res = await callAs(
      world.owner,
      spaceRoute.PATCH,
      req("PATCH", `/api/spaces/${spaceId}`, { isPrivate: true }),
      { spaceId },
    );
    expect(res.status).toBe(200);
    const left = await db.taskAssignee.findMany({ where: { taskId } });
    expect(left.map((a) => a.userId)).toEqual([world.admin.id]);
  });

  it("listing a member again does not bring the assignment back", async () => {
    const { workspaceId, spaceId, taskId } = await createListFor(world);
    await callAs(
      world.owner,
      spaceRoute.PATCH,
      req("PATCH", `/api/spaces/${spaceId}`, { isPrivate: true }),
      { spaceId },
    );
    await callAs(
      world.owner,
      spaceMembersRoute.POST,
      req("POST", `/api/spaces/${spaceId}/members`, {
        userId: world.member.id,
      }),
      { spaceId },
    );
    expect(await db.taskAssignee.count({ where: { taskId } })).toBe(0);
    expect(workspaceId).toBeTruthy();
  });
});

describe("the checklist", () => {
  const add = (
    listId: string,
    taskId: string,
    title: string,
    actor: Actor = world.member,
  ) =>
    callAs(
      actor,
      subtasksRoute.POST,
      req("POST", `/api/lists/${listId}/tasks/${taskId}/subtasks`, { title }),
      {
        listId,
        taskId,
      },
    );
  const change = (
    listId: string,
    taskId: string,
    subtaskId: string,
    body: object,
    actor: Actor = world.member,
  ) =>
    callAs(
      actor,
      subtaskRoute.PATCH,
      req(
        "PATCH",
        `/api/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`,
        body,
      ),
      { listId, taskId, subtaskId },
    );
  const remove = (
    listId: string,
    taskId: string,
    subtaskId: string,
    actor: Actor = world.member,
  ) =>
    callAs(
      actor,
      subtaskRoute.DELETE,
      req(
        "DELETE",
        `/api/lists/${listId}/tasks/${taskId}/subtasks/${subtaskId}`,
      ),
      { listId, taskId, subtaskId },
    );
  const positions = async (taskId: string) =>
    (
      await db.subtask.findMany({
        where: { taskId },
        orderBy: { position: "asc" },
      })
    ).map((s) => [s.title, s.position]);

  it("adds, ticks, renames and removes items, keeping positions 0..n-1", async () => {
    const { listId, taskId, subtaskId } = await createListFor(world); // one item: "Step"
    const second = await (await add(listId, taskId, "  Second  ")).json();
    const third = await (await add(listId, taskId, "Third")).json();
    expect(await positions(taskId)).toEqual([
      ["Step", 0],
      ["Second", 1],
      ["Third", 2],
    ]);

    const ticked = await change(listId, taskId, second.id, {
      done: true,
      title: "Second!",
    });
    expect(await ticked.json()).toMatchObject({ title: "Second!", done: true });

    expect((await remove(listId, taskId, subtaskId)).status).toBe(204);
    expect(await positions(taskId)).toEqual([
      ["Second!", 0],
      ["Third", 1],
    ]);
    expect(third.id).toBeTruthy();
  });

  it("does not move the board version, and the card shows the count", async () => {
    const { listId, taskId } = await createListFor(world);
    const before = (await db.list.findUniqueOrThrow({ where: { id: listId } }))
      .boardVersion;
    const item = await (await add(listId, taskId, "Ship it")).json();
    await change(listId, taskId, item.id, { done: true });
    expect(
      (await db.list.findUniqueOrThrow({ where: { id: listId } })).boardVersion,
    ).toBe(before);

    const board = await getBoard(world.owner.id, listId);
    expect(board.columns[0]!.tasks[0]!.subtasks).toEqual({ total: 2, done: 1 });
  });

  it("stops at 50 items, refuses a guest, and hides items of other tasks", async () => {
    const { listId, taskId } = await createListFor(world);
    await db.subtask.createMany({
      data: Array.from({ length: 49 }, (_, i) => ({
        taskId,
        title: `S${i}`,
        position: i + 1,
      })),
    });
    const full = await add(listId, taskId, "One too many");
    expect(full.status).toBe(409);
    expect((await full.json()).error.code).toBe("LIMIT_REACHED");

    expect((await add(listId, taskId, "x", world.guest)).status).toBe(403);
    expect((await add(listId, taskId, "x", world.stranger)).status).toBe(404);

    const other = await createListFor(world);
    expect(
      (await change(listId, taskId, other.subtaskId, { done: true })).status,
    ).toBe(404);
    expect((await remove(listId, taskId, other.subtaskId)).status).toBe(404);
    expect((await add(listId, other.taskId, "Wrong list")).status).toBe(404);
  });

  it.each([
    ["an empty title", { title: "   " }],
    ["a title over 160 characters", { title: "x".repeat(161) }],
    ["an unknown field", { title: "ok", position: 3 }],
  ])("rejects %s", async (_name, body) => {
    const { listId, taskId } = await createListFor(world);
    const res = await callAs(
      world.member,
      subtasksRoute.POST,
      req("POST", `/api/lists/${listId}/tasks/${taskId}/subtasks`, body),
      {
        listId,
        taskId,
      },
    );
    expect(res.status).toBe(400);
  });
});

describe("comments", () => {
  const comment = (
    listId: string,
    taskId: string,
    body: string,
    actor: Actor = world.member,
  ) =>
    callAs(
      actor,
      commentsRoute.POST,
      req("POST", `/api/lists/${listId}/tasks/${taskId}/comments`, { body }),
      {
        listId,
        taskId,
      },
    );
  const remove = (
    listId: string,
    taskId: string,
    commentId: string,
    actor: Actor,
  ) =>
    callAs(
      actor,
      commentRoute.DELETE,
      req(
        "DELETE",
        `/api/lists/${listId}/tasks/${taskId}/comments/${commentId}`,
      ),
      { listId, taskId, commentId },
    );

  it("a member comments, with name and time and never an email", async () => {
    const { listId, taskId } = await createListFor(world);
    const res = await comment(listId, taskId, "  Looks good  ");
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({
      body: "Looks good",
      author: { id: world.member.id, name: "member" },
    });
    expect(JSON.stringify(body)).not.toMatch(/@example\.test/);
    expect(await db.comment.count({ where: { taskId } })).toBe(2); // the fixture one and this
  });

  it("only the author or an admin deletes a comment; a guest cannot comment", async () => {
    const { listId, taskId, commentId } = await createListFor(world); // written by the member
    const mine = await (
      await comment(listId, taskId, "Mine", world.owner)
    ).json();

    expect((await remove(listId, taskId, commentId, world.guest)).status).toBe(
      403,
    );
    expect((await remove(listId, taskId, mine.id, world.member)).status).toBe(
      403,
    ); // not theirs
    expect((await remove(listId, taskId, commentId, world.member)).status).toBe(
      204,
    ); // their own
    expect((await remove(listId, taskId, mine.id, world.admin)).status).toBe(
      204,
    ); // an admin, any
    expect((await comment(listId, taskId, "Hi", world.guest)).status).toBe(403);
  });

  it("cannot reach a comment through another task", async () => {
    const a = await createListFor(world);
    const b = await createListFor(world);
    expect(
      (await remove(a.listId, a.taskId, b.commentId, world.owner)).status,
    ).toBe(404);
    expect(await db.comment.count({ where: { id: b.commentId } })).toBe(1);
  });

  it.each([
    ["an empty comment", "   "],
    ["a comment over 2000 characters", "x".repeat(2001)],
  ])("rejects %s", async (_name, body) => {
    const { listId, taskId } = await createListFor(world);
    expect((await comment(listId, taskId, body)).status).toBe(400);
  });
});

describe("the detail of a task", () => {
  const detail = (listId: string, taskId: string, actor: Actor | null) =>
    callAs(
      actor,
      taskRoute.GET,
      req("GET", `/api/lists/${listId}/tasks/${taskId}`),
      { listId, taskId },
    );

  it("gives checklist, comments and history to anyone who can see the list", async () => {
    const { listId, taskId } = await createListFor(world);
    await patch(listId, taskId, {
      blockedReason: "Waiting",
      expectedBoardVersion: 0,
    });

    const res = await detail(listId, taskId, world.guest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.subtasks).toEqual([
      expect.objectContaining({ title: "Step", done: false }),
    ]);
    expect(body.comments).toEqual([
      expect.objectContaining({
        body: "Hello",
        author: { id: world.member.id, name: "member" },
      }),
    ]);
    expect(body.events).toEqual([
      expect.objectContaining({ type: "BLOCKED", actor: "owner" }),
    ]);
  });

  it("answers 404 to a stranger and for a task of another list, 401 to nobody", async () => {
    const a = await createListFor(world);
    const b = await createListFor(world);
    expect((await detail(a.listId, a.taskId, world.stranger)).status).toBe(404);
    expect((await detail(a.listId, b.taskId, world.owner)).status).toBe(404);
    expect((await detail(a.listId, a.taskId, null)).status).toBe(401);
  });
});
