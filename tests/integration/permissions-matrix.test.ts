import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import {
  createListFor,
  createWorld,
  snapshot,
  type World,
} from "../helpers/world";

const workspace = await import("@/app/api/workspaces/[workspaceId]/route");
const members =
  await import("@/app/api/workspaces/[workspaceId]/members/route");
const member =
  await import("@/app/api/workspaces/[workspaceId]/members/[userId]/route");
const spaces = await import("@/app/api/workspaces/[workspaceId]/spaces/route");
const space = await import("@/app/api/spaces/[spaceId]/route");
const spaceMembers = await import("@/app/api/spaces/[spaceId]/members/route");
const spaceMember =
  await import("@/app/api/spaces/[spaceId]/members/[userId]/route");
const folders = await import("@/app/api/spaces/[spaceId]/folders/route");
const folder = await import("@/app/api/folders/[folderId]/route");
const lists = await import("@/app/api/lists/route");
const list = await import("@/app/api/lists/[listId]/route");
const board = await import("@/app/api/lists/[listId]/board/route");
const tasks = await import("@/app/api/lists/[listId]/tasks/route");
const task = await import("@/app/api/lists/[listId]/tasks/[taskId]/route");
const move = await import("@/app/api/lists/[listId]/tasks/[taskId]/move/route");
const version = await import("@/app/api/lists/[listId]/version/route");
const { db } = await import("@/server/db");

const BASE = "http://localhost:3000";
const HEADERS = { origin: BASE, "content-type": "application/json" };

type Kind = "owner" | "admin" | "member" | "guest" | "stranger" | "anonymous";
const KINDS: Kind[] = [
  "owner",
  "admin",
  "member",
  "guest",
  "stranger",
  "anonymous",
];

type Fixture = Awaited<ReturnType<typeof createListFor>>;
/** The fixture plus the ids of the list's first two columns. */
type Ctx = Fixture & {
  world: World;
  actor: Actor | null;
  columns: [string, string];
};
type Call = (ctx: Ctx) => Promise<Response>;
type Handler<P> = (
  request: Request,
  context: { params: Promise<P> },
) => Promise<Response>;

const send = (method: string, path: string, body?: object) =>
  new Request(`${BASE}${path}`, {
    method,
    headers: HEADERS,
    body: body ? JSON.stringify(body) : undefined,
  });

/** One route call: method, path and params built from the fixture, optional JSON body. */
const route =
  <P extends object>(
    handler: Handler<P>,
    method: string,
    at: (c: Ctx) => { path: string; params: P },
    body?: (c: Ctx) => object,
  ): Call =>
  (ctx) => {
    const { path, params } = at(ctx);
    return callAs(ctx.actor, handler, send(method, path, body?.(ctx)), params);
  };

const ws =
  (tail = "") =>
  (c: Ctx) => ({
    path: `/api/workspaces/${c.workspaceId}${tail}`,
    params: { workspaceId: c.workspaceId },
  });
const wsMember = (target: (c: Ctx) => string) => (c: Ctx) => ({
  path: `/api/workspaces/${c.workspaceId}/members/${target(c)}`,
  params: { workspaceId: c.workspaceId, userId: target(c) },
});
const sp =
  (tail = "") =>
  (c: Ctx) => ({
    path: `/api/spaces/${c.spaceId}${tail}`,
    params: { spaceId: c.spaceId },
  });
const fo = (c: Ctx) => ({
  path: `/api/folders/${c.folderId}`,
  params: { folderId: c.folderId },
});
const li =
  (tail = "") =>
  (c: Ctx) => ({
    path: `/api/lists/${c.listId}${tail}`,
    params: { listId: c.listId },
  });
const ta =
  (tail = "") =>
  (c: Ctx) => ({
    path: `/api/lists/${c.listId}/tasks/${c.taskId}${tail}`,
    params: { listId: c.listId, taskId: c.taskId },
  });
const v0 = { expectedBoardVersion: 0 };

// [route, call, expected status per caller (owner, admin, member, guest, stranger, anonymous)]
const matrix: [string, Call, number[]][] = [
  // Workspace
  [
    "GET workspace",
    route(workspace.GET, "GET", ws()),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "PATCH workspace",
    route(workspace.PATCH, "PATCH", ws(), () => ({ name: "Renamed" })),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE workspace",
    route(workspace.DELETE, "DELETE", ws()),
    [204, 403, 403, 403, 404, 401],
  ],
  // Members
  [
    "GET members",
    route(members.GET, "GET", ws("/members")),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "POST member as MEMBER",
    route(members.POST, "POST", ws("/members"), (c) => ({
      email: c.world.candidate.email,
      role: "MEMBER",
    })),
    [201, 201, 403, 403, 404, 401],
  ],
  [
    "POST member as ADMIN",
    route(members.POST, "POST", ws("/members"), (c) => ({
      email: c.world.candidate.email,
      role: "ADMIN",
    })),
    [201, 403, 403, 403, 404, 401],
  ],
  [
    "PATCH member to GUEST",
    route(
      member.PATCH,
      "PATCH",
      wsMember((c) => c.world.member.id),
      () => ({
        role: "GUEST",
      }),
    ),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "PATCH member to ADMIN",
    route(
      member.PATCH,
      "PATCH",
      wsMember((c) => c.world.member.id),
      () => ({
        role: "ADMIN",
      }),
    ),
    [200, 403, 403, 403, 404, 401],
  ],
  [
    "PATCH an ADMIN down",
    route(
      member.PATCH,
      "PATCH",
      wsMember((c) => c.world.admin.id),
      () => ({
        role: "MEMBER",
      }),
    ),
    [200, 403, 403, 403, 404, 401],
  ],
  [
    "PATCH the owner",
    route(
      member.PATCH,
      "PATCH",
      wsMember((c) => c.world.owner.id),
      () => ({
        role: "GUEST",
      }),
    ),
    [403, 403, 403, 403, 404, 401],
  ],
  [
    "DELETE a MEMBER",
    route(
      member.DELETE,
      "DELETE",
      wsMember((c) => c.world.member.id),
    ),
    [204, 204, 403, 403, 404, 401],
  ],
  [
    "DELETE an ADMIN",
    route(
      member.DELETE,
      "DELETE",
      wsMember((c) => c.world.admin.id),
    ),
    [204, 403, 403, 403, 404, 401],
  ],
  [
    "DELETE the owner",
    route(
      member.DELETE,
      "DELETE",
      wsMember((c) => c.world.owner.id),
    ),
    [403, 403, 403, 403, 404, 401],
  ],
  // No voluntary leaving in v1: removing yourself follows the same rules as removing anyone.
  [
    "DELETE yourself",
    route(
      member.DELETE,
      "DELETE",
      wsMember((c) => c.actor?.id ?? "nobody"),
    ),
    [403, 403, 403, 403, 404, 401],
  ],
  // Structure: OWNER and ADMIN only. The guest is listed in the space, so it gets 403, not 404.
  [
    "POST space",
    route(spaces.POST, "POST", ws("/spaces"), () => ({ name: "New space" })),
    [201, 201, 403, 403, 404, 401],
  ],
  [
    "PATCH space",
    route(space.PATCH, "PATCH", sp(), () => ({ isPrivate: true })),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE space",
    route(space.DELETE, "DELETE", sp()),
    [204, 204, 403, 403, 404, 401],
  ],
  [
    "POST space member",
    route(spaceMembers.POST, "POST", sp("/members"), (c) => ({
      userId: c.world.member.id,
    })),
    [204, 204, 403, 403, 404, 401],
  ],
  [
    "DELETE space member",
    route(spaceMember.DELETE, "DELETE", (c) => ({
      path: `/api/spaces/${c.spaceId}/members/${c.world.guest.id}`,
      params: { spaceId: c.spaceId, userId: c.world.guest.id },
    })),
    [204, 204, 403, 403, 404, 401],
  ],
  [
    "POST folder",
    route(folders.POST, "POST", sp("/folders"), () => ({ name: "New folder" })),
    [201, 201, 403, 403, 404, 401],
  ],
  [
    "PATCH folder",
    route(folder.PATCH, "PATCH", fo, () => ({ name: "Renamed" })),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE folder",
    route(folder.DELETE, "DELETE", fo),
    [204, 204, 403, 403, 404, 401],
  ],
  [
    "POST list",
    route(
      lists.POST,
      "POST",
      () => ({ path: "/api/lists", params: {} }),
      (c) => ({ spaceId: c.spaceId, folderId: c.folderId, name: "New list" }),
    ),
    [201, 201, 403, 403, 404, 401],
  ],
  ["GET list", route(list.GET, "GET", li()), [200, 200, 200, 200, 404, 401]],
  [
    "PATCH list",
    route(list.PATCH, "PATCH", li(), () => ({ name: "Renamed", ...v0 })),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE list",
    route(list.DELETE, "DELETE", li(), () => v0),
    [204, 204, 403, 403, 404, 401],
  ],
  // Tasks: owner, admin and member write; a guest only reads.
  [
    "GET board",
    route(board.GET, "GET", li("/board")),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "GET version",
    route(version.GET, "GET", li("/version")),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "POST task",
    route(tasks.POST, "POST", li("/tasks"), (c) => ({
      id: crypto.randomUUID(),
      columnId: c.columns[0],
      title: "New task",
      ...v0,
    })),
    [201, 201, 201, 403, 404, 401],
  ],
  [
    "PATCH task",
    route(task.PATCH, "PATCH", ta(), () => ({ title: "Edited", ...v0 })),
    [200, 200, 200, 403, 404, 401],
  ],
  [
    "DELETE task",
    route(task.DELETE, "DELETE", ta(), () => v0),
    [204, 204, 204, 403, 404, 401],
  ],
  // Moves the fixture task to the front of the second column, so a success always changes state.
  [
    "PATCH move task",
    route(move.PATCH, "PATCH", ta("/move"), (c) => ({
      columnId: c.columns[1],
      toIndex: 0,
      ...v0,
    })),
    [200, 200, 200, 403, 404, 401],
  ],
];

let world: World;
const actorOf = (kind: Kind): Actor | null =>
  kind === "anonymous" ? null : world[kind];

async function setUp(options?: { privateSpace?: boolean }) {
  const fixture = await createListFor(world, options);
  const [first, second] = await db.boardColumn.findMany({
    where: { listId: fixture.listId },
    orderBy: { position: "asc" },
  });
  return { ...fixture, columns: [first!.id, second!.id] as [string, string] };
}

beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

describe.each(matrix)("%s", (name, call, expected) => {
  it.each(KINDS.map((kind, i) => [kind, expected[i]!] as const))(
    "%s gets %i",
    async (kind, status) => {
      const fixture = await setUp();
      const before = await snapshot(fixture.workspaceId);

      const res = await call({ ...fixture, world, actor: actorOf(kind) });

      expect(res.status).toBe(status);
      if (status >= 400) {
        // A rejected request changes nothing: no row, no version bump, no updatedAt.
        expect(await snapshot(fixture.workspaceId)).toBe(before);
      } else if (!name.startsWith("GET")) {
        expect(await snapshot(fixture.workspaceId)).not.toBe(before);
      }
    },
  );
});

describe("a private space nobody is listed in", () => {
  const cases: [string, Call][] = [
    ["GET list", route(list.GET, "GET", li())],
    ["GET board", route(board.GET, "GET", li("/board"))],
    ["GET version", route(version.GET, "GET", li("/version"))],
    [
      "PATCH task",
      route(task.PATCH, "PATCH", ta(), () => ({ title: "Edited", ...v0 })),
    ],
    // A stale version must still be 404, or the 409 would reveal the list and its version.
    [
      "PATCH list with a stale version",
      route(list.PATCH, "PATCH", li(), () => ({
        name: "X",
        expectedBoardVersion: 7,
      })),
    ],
    ["PATCH space", route(space.PATCH, "PATCH", sp(), () => ({ name: "X" }))],
  ];

  it.each(cases)(
    "%s: 404 for an unlisted member and guest, reachable for an admin",
    async (_name, call) => {
      const fixture = await setUp({ privateSpace: true });
      const before = await snapshot(fixture.workspaceId);
      for (const kind of ["member", "guest"] as const) {
        const res = await call({ ...fixture, world, actor: world[kind] });
        expect(res.status).toBe(404);
      }
      expect(await snapshot(fixture.workspaceId)).toBe(before);
      const res = await call({ ...fixture, world, actor: world.admin });
      expect([200, 409]).toContain(res.status);
    },
  );

  it("becomes visible to a member once listed", async () => {
    const fixture = await setUp({ privateSpace: true });
    await db.spaceMember.create({
      data: {
        spaceId: fixture.spaceId,
        workspaceId: fixture.workspaceId,
        userId: world.member.id,
      },
    });
    const res = await route(
      board.GET,
      "GET",
      li("/board"),
    )({
      ...fixture,
      world,
      actor: world.member,
    });
    expect(res.status).toBe(200);
  });
});

describe("another workspace", () => {
  it("is not reachable through this workspace's member routes (404)", async () => {
    const mine = await setUp();
    const other = await setUp();
    // A user who belongs only to the other workspace.
    await db.workspaceMember.create({
      data: {
        workspaceId: other.workspaceId,
        userId: world.candidate.id,
        role: "MEMBER",
      },
    });
    const before = await snapshot(mine.workspaceId);
    const res = await route(
      member.DELETE,
      "DELETE",
      wsMember(() => world.candidate.id),
    )({ ...mine, world, actor: world.owner });
    expect(res.status).toBe(404);
    expect(await snapshot(mine.workspaceId)).toBe(before);
  });

  it("cannot have one of its folders used for a list created here (400)", async () => {
    const mine = await setUp();
    const other = await setUp();
    const res = await route(
      lists.POST,
      "POST",
      () => ({ path: "/api/lists", params: {} }),
      () => ({ spaceId: mine.spaceId, folderId: other.folderId, name: "X" }),
    )({ ...mine, world, actor: world.owner });
    expect(res.status).toBe(400);
  });
});
