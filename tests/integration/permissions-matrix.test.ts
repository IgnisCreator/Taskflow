import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import {
  createProjectFor,
  createWorld,
  snapshot,
  type World,
} from "../helpers/world";

const project = await import("@/app/api/projects/[projectId]/route");
const members = await import("@/app/api/projects/[projectId]/members/route");
const member =
  await import("@/app/api/projects/[projectId]/members/[userId]/route");
const board = await import("@/app/api/projects/[projectId]/board/route");
const tasks = await import("@/app/api/projects/[projectId]/tasks/route");
const task =
  await import("@/app/api/projects/[projectId]/tasks/[taskId]/route");
const move =
  await import("@/app/api/projects/[projectId]/tasks/[taskId]/move/route");
const version = await import("@/app/api/projects/[projectId]/version/route");
const { db } = await import("@/server/db");

const BASE = "http://localhost:3000";
const HEADERS = { origin: BASE, "content-type": "application/json" };

type Kind = "owner" | "admin" | "member" | "viewer" | "stranger" | "anonymous";
const KINDS: Kind[] = [
  "owner",
  "admin",
  "member",
  "viewer",
  "stranger",
  "anonymous",
];

type Ctx = {
  world: World;
  projectId: string;
  taskId: string;
  actor: Actor | null;
};
type Call = (ctx: Ctx) => Promise<Response>;

const url = (projectId: string, tail = "") =>
  `${BASE}/api/projects/${projectId}${tail}`;
const send = (method: string, href: string, body?: object) =>
  new Request(href, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });

const onProject =
  (
    handler: typeof project.GET | typeof project.PATCH | typeof project.DELETE,
    method: string,
    body?: object,
  ): Call =>
  ({ actor, projectId }) =>
    callAs(actor, handler, send(method, url(projectId), body), { projectId });

const onMembers =
  (
    handler: typeof members.GET | typeof members.POST,
    method: string,
    body?: (w: World) => object,
  ): Call =>
  ({ actor, projectId, world }) =>
    callAs(
      actor,
      handler,
      send(method, url(projectId, "/members"), body?.(world)),
      { projectId },
    );

const onMember =
  (
    handler: typeof member.PATCH | typeof member.DELETE,
    method: string,
    target: (c: Ctx) => string,
    body?: object,
  ): Call =>
  (ctx) => {
    const userId = target(ctx);
    return callAs(
      ctx.actor,
      handler,
      send(method, url(ctx.projectId, `/members/${userId}`), body),
      {
        projectId: ctx.projectId,
        userId,
      },
    );
  };

// [route, call, expected status per caller (owner, admin, member, viewer, stranger, anonymous)]
const onBoard: Call = ({ actor, projectId }) =>
  callAs(actor, board.GET, send("GET", url(projectId, "/board")), {
    projectId,
  });

const onNewTask: Call = async ({ actor, projectId }) => {
  const column = await db.boardColumn.findFirstOrThrow({
    where: { projectId, position: 0 },
  });
  return callAs(
    actor,
    tasks.POST,
    send("POST", url(projectId, "/tasks"), {
      id: crypto.randomUUID(),
      columnId: column.id,
      title: "New task",
      expectedBoardVersion: 0,
    }),
    { projectId },
  );
};

const onVersion: Call = ({ actor, projectId }) =>
  callAs(actor, version.GET, send("GET", url(projectId, "/version")), {
    projectId,
  });

// Moves the fixture task to the front of the second column, so a success always changes state.
const onMove: Call = async ({ actor, projectId, taskId }) => {
  const column = await db.boardColumn.findFirstOrThrow({
    where: { projectId, position: 1 },
  });
  return callAs(
    actor,
    move.PATCH,
    send("PATCH", url(projectId, `/tasks/${taskId}/move`), {
      columnId: column.id,
      toIndex: 0,
      expectedBoardVersion: 0,
    }),
    { projectId, taskId },
  );
};

const onTask =
  (
    handler: typeof task.PATCH | typeof task.DELETE,
    method: string,
    body: object,
  ): Call =>
  ({ actor, projectId, taskId }) =>
    callAs(
      actor,
      handler,
      send(method, url(projectId, `/tasks/${taskId}`), body),
      {
        projectId,
        taskId,
      },
    );

const matrix: [string, Call, number[]][] = [
  [
    "GET project",
    onProject(project.GET, "GET"),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "PATCH project",
    onProject(project.PATCH, "PATCH", {
      name: "Renamed",
      expectedBoardVersion: 0,
    }),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE project",
    onProject(project.DELETE, "DELETE", { expectedBoardVersion: 0 }),
    [204, 403, 403, 403, 404, 401],
  ],
  [
    "GET members",
    onMembers(members.GET, "GET"),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "POST member as MEMBER",
    onMembers(members.POST, "POST", (w) => ({
      publicId: w.candidatePublicId,
      role: "MEMBER",
      expectedBoardVersion: 0,
    })),
    [201, 201, 403, 403, 404, 401],
  ],
  [
    "POST member as ADMIN",
    onMembers(members.POST, "POST", (w) => ({
      publicId: w.candidatePublicId,
      role: "ADMIN",
      expectedBoardVersion: 0,
    })),
    [201, 403, 403, 403, 404, 401],
  ],
  [
    "PATCH member to VIEWER",
    onMember(member.PATCH, "PATCH", (c) => c.world.member.id, {
      role: "VIEWER",
      expectedBoardVersion: 0,
    }),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "PATCH member to ADMIN",
    onMember(member.PATCH, "PATCH", (c) => c.world.member.id, {
      role: "ADMIN",
      expectedBoardVersion: 0,
    }),
    [200, 403, 403, 403, 404, 401],
  ],
  [
    "PATCH an ADMIN down",
    onMember(member.PATCH, "PATCH", (c) => c.world.admin.id, {
      role: "MEMBER",
      expectedBoardVersion: 0,
    }),
    [200, 403, 403, 403, 404, 401],
  ],
  [
    "PATCH the owner",
    onMember(member.PATCH, "PATCH", (c) => c.world.owner.id, {
      role: "VIEWER",
      expectedBoardVersion: 0,
    }),
    [403, 403, 403, 403, 404, 401],
  ],
  [
    "DELETE a MEMBER",
    onMember(member.DELETE, "DELETE", (c) => c.world.member.id, {
      expectedBoardVersion: 0,
    }),
    [204, 204, 403, 403, 404, 401],
  ],
  [
    "DELETE an ADMIN",
    onMember(member.DELETE, "DELETE", (c) => c.world.admin.id, {
      expectedBoardVersion: 0,
    }),
    [204, 403, 403, 403, 404, 401],
  ],
  [
    "DELETE the owner",
    onMember(member.DELETE, "DELETE", (c) => c.world.owner.id, {
      expectedBoardVersion: 0,
    }),
    [403, 403, 403, 403, 404, 401],
  ],
  // No voluntary leaving in v1: removing yourself follows the same rules as removing anyone.
  [
    "DELETE yourself",
    onMember(member.DELETE, "DELETE", (c) => c.actor?.id ?? "nobody", {
      expectedBoardVersion: 0,
    }),
    [403, 403, 403, 403, 404, 401],
  ],
  // Tasks: owner, admin and member write; a viewer only reads.
  ["GET board", onBoard, [200, 200, 200, 200, 404, 401]],
  ["GET version", onVersion, [200, 200, 200, 200, 404, 401]],
  ["PATCH move task", onMove, [200, 200, 200, 403, 404, 401]],
  ["POST task", onNewTask, [201, 201, 201, 403, 404, 401]],
  [
    "PATCH task",
    onTask(task.PATCH, "PATCH", { title: "Edited", expectedBoardVersion: 0 }),
    [200, 200, 200, 403, 404, 401],
  ],
  [
    "DELETE task",
    onTask(task.DELETE, "DELETE", { expectedBoardVersion: 0 }),
    [204, 204, 204, 403, 404, 401],
  ],
];

let world: World;
const actorOf = (kind: Kind): Actor | null =>
  kind === "anonymous" ? null : world[kind];

beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

describe.each(matrix)("%s", (_route, call, expected) => {
  it.each(KINDS.map((kind, i) => [kind, expected[i]!] as const))(
    "%s gets %i",
    async (kind, status) => {
      const { projectId, taskId } = await createProjectFor(world);
      const before = await snapshot(projectId);

      const res = await call({
        world,
        projectId,
        taskId,
        actor: actorOf(kind),
      });

      expect(res.status).toBe(status);
      const readOnly = _route.startsWith("GET");
      if (status >= 400) {
        // A rejected request changes nothing: no row, no version bump.
        expect(await snapshot(projectId)).toBe(before);
      } else if (!readOnly && !_route.startsWith("DELETE project")) {
        expect(await snapshot(projectId)).not.toBe(before);
      }
    },
  );
});

describe("a project from another team", () => {
  it("is not reachable through this project's member routes (404)", async () => {
    const mine = await createProjectFor(world);
    const other = await createProjectFor(world);
    // A user who belongs only to the other project.
    const outsider = world.candidate;
    const { db } = await import("@/server/db");
    await db.projectMember.create({
      data: { projectId: other.projectId, userId: outsider.id, role: "MEMBER" },
    });
    const before = await snapshot(mine.projectId);

    const res = await callAs(
      world.owner,
      member.DELETE,
      send("DELETE", url(mine.projectId, `/members/${outsider.id}`), {
        expectedBoardVersion: 0,
      }),
      { projectId: mine.projectId, userId: outsider.id },
    );

    expect(res.status).toBe(404);
    expect(await snapshot(mine.projectId)).toBe(before);
  });
});
