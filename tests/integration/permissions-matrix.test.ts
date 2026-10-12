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
const subtasks =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/subtasks/route");
const subtask =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/subtasks/[subtaskId]/route");
const comments =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/comments/route");
const comment =
  await import("@/app/api/lists/[listId]/tasks/[taskId]/comments/[commentId]/route");
const activity = await import("@/app/api/lists/[listId]/activity/route");
const listMetrics = await import("@/app/api/lists/[listId]/metrics/route");
const spaceMetrics = await import("@/app/api/spaces/[spaceId]/metrics/route");
const catalog =
  await import("@/app/api/workspaces/[workspaceId]/catalog/route");
const catalogKind =
  await import("@/app/api/workspaces/[workspaceId]/catalog/[kind]/route");
const catalogItem = await import("@/app/api/catalog/[kind]/[itemId]/route");
const flow = await import("@/app/api/lists/[listId]/flow/route");
const templates =
  await import("@/app/api/workspaces/[workspaceId]/templates/route");
const template = await import("@/app/api/templates/[templateId]/route");
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
/** The fixture plus the ids of the list's first two columns and of an organisation template. */
type Ctx = Fixture & {
  world: World;
  actor: Actor | null;
  columns: [string, string];
  templateId: string;
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

/** The list's stages as the flow editor sends them back, with the first one renamed. */
const onFlow: Call = async (c) => {
  const rows = await db.boardColumn.findMany({
    where: { listId: c.listId },
    orderBy: { position: "asc" },
  });
  const stages = rows.map(
    ({ id, name, category, wipLimit, policy, isCommitmentPoint }, i) => ({
      id,
      name: i === 0 ? "Inbox" : name,
      category,
      wipLimit,
      policy,
      isCommitmentPoint,
    }),
  );
  return callAs(
    c.actor,
    flow.PUT,
    send("PUT", `/api/lists/${c.listId}/flow`, { ...v0, stages }),
    { listId: c.listId },
  );
};

const saveTemplate = (c: Ctx) =>
  callAs(
    c.actor,
    templates.POST,
    send("POST", `/api/workspaces/${c.workspaceId}/templates`, {
      name: "Saved",
      fromListId: c.listId,
    }),
    { workspaceId: c.workspaceId },
  );

/** A call on the fixture template (created in setUp, so the snapshot taken before the call includes it). */
const onTemplate =
  (
    handler: typeof template.PATCH | typeof template.DELETE,
    method: string,
    body?: object,
  ): Call =>
  (c) =>
    callAs(
      c.actor,
      handler,
      send(method, `/api/templates/${c.templateId}`, body),
      { templateId: c.templateId },
    );

const onSubtask = (
  handler: typeof subtask.PATCH | typeof subtask.DELETE,
  method: string,
  body?: object,
): Call =>
  route(
    handler,
    method,
    (c) => ({
      path: `/api/lists/${c.listId}/tasks/${c.taskId}/subtasks/${c.subtaskId}`,
      params: { listId: c.listId, taskId: c.taskId, subtaskId: c.subtaskId },
    }),
    body && (() => body),
  );

const onComment = route(comment.DELETE, "DELETE", (c) => ({
  path: `/api/lists/${c.listId}/tasks/${c.taskId}/comments/${c.commentId}`,
  params: { listId: c.listId, taskId: c.taskId, commentId: c.commentId },
}));

const onCatalogItem = (
  handler: typeof catalogItem.PATCH | typeof catalogItem.DELETE,
  method: string,
  kind: "types" | "labels",
  body?: object,
): Call =>
  route(
    handler,
    method,
    (c) => {
      const itemId = kind === "types" ? c.typeId : c.labelId;
      return {
        path: `/api/catalog/${kind}/${itemId}`,
        params: { kind, itemId },
      };
    },
    body && (() => body),
  );

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
  // Workflows and templates: members read, OWNER and ADMIN change.
  ["PUT flow", onFlow, [200, 200, 403, 403, 404, 401]],
  [
    "GET templates",
    route(templates.GET, "GET", ws("/templates")),
    [200, 200, 200, 200, 404, 401],
  ],
  ["POST template", saveTemplate, [201, 201, 403, 403, 404, 401]],
  [
    "PATCH template",
    onTemplate(template.PATCH, "PATCH", { name: "Renamed" }),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE template",
    onTemplate(template.DELETE, "DELETE"),
    [204, 204, 403, 403, 404, 401],
  ],
  // Task details: members write them, a guest only reads, and the board version is not involved.
  [
    "GET task detail",
    route(task.GET, "GET", ta()),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "POST subtask",
    route(subtasks.POST, "POST", ta("/subtasks"), () => ({
      title: "New step",
    })),
    [201, 201, 201, 403, 404, 401],
  ],
  [
    "PATCH subtask",
    onSubtask(subtask.PATCH, "PATCH", { done: true }),
    [200, 200, 200, 403, 404, 401],
  ],
  [
    "DELETE subtask",
    onSubtask(subtask.DELETE, "DELETE"),
    [204, 204, 204, 403, 404, 401],
  ],
  [
    "POST comment",
    route(comments.POST, "POST", ta("/comments"), () => ({
      body: "A comment",
    })),
    [201, 201, 201, 403, 404, 401],
  ],
  // The fixture comment was written by the member: its author and the admins can delete it.
  ["DELETE comment", onComment, [204, 204, 204, 403, 404, 401]],
  [
    "GET activity",
    route(activity.GET, "GET", li("/activity")),
    [200, 200, 200, 200, 404, 401],
  ],
  // Metrics: anyone who can see the list (or the space) reads them.
  [
    "GET list metrics",
    route(listMetrics.GET, "GET", li("/metrics")),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "GET space metrics",
    route(spaceMetrics.GET, "GET", sp("/metrics")),
    [200, 200, 200, 200, 404, 401],
  ],
  // The workspace lists of task types and labels: members read, OWNER and ADMIN change.
  [
    "GET catalog",
    route(catalog.GET, "GET", ws("/catalog")),
    [200, 200, 200, 200, 404, 401],
  ],
  [
    "POST task type",
    route(
      catalogKind.POST,
      "POST",
      (c) => ({
        path: `/api/workspaces/${c.workspaceId}/catalog/types`,
        params: { workspaceId: c.workspaceId, kind: "types" },
      }),
      () => ({ name: "Spike" }),
    ),
    [201, 201, 403, 403, 404, 401],
  ],
  [
    "POST label",
    route(
      catalogKind.POST,
      "POST",
      (c) => ({
        path: `/api/workspaces/${c.workspaceId}/catalog/labels`,
        params: { workspaceId: c.workspaceId, kind: "labels" },
      }),
      () => ({ name: "later" }),
    ),
    [201, 201, 403, 403, 404, 401],
  ],
  [
    "PATCH task type",
    onCatalogItem(catalogItem.PATCH, "PATCH", "types", { name: "Renamed" }),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE task type",
    onCatalogItem(catalogItem.DELETE, "DELETE", "types"),
    [204, 204, 403, 403, 404, 401],
  ],
  [
    "PATCH label",
    onCatalogItem(catalogItem.PATCH, "PATCH", "labels", { name: "Renamed" }),
    [200, 200, 403, 403, 404, 401],
  ],
  [
    "DELETE label",
    onCatalogItem(catalogItem.DELETE, "DELETE", "labels"),
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
  const { id: templateId } = await db.workflowTemplate.create({
    data: { workspaceId: fixture.workspaceId, name: "Mine", stages: [] },
  });
  return {
    ...fixture,
    columns: [first!.id, second!.id] as [string, string],
    templateId,
  };
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
