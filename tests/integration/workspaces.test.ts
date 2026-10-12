import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  callAs,
  cleanupTestData,
  createActor,
  type Actor,
} from "../helpers/actors";
import {
  createListFor,
  createWorld,
  snapshot,
  type World,
} from "../helpers/world";

const workspacesRoute = await import("@/app/api/workspaces/route");
const workspaceRoute = await import("@/app/api/workspaces/[workspaceId]/route");
const membersRoute =
  await import("@/app/api/workspaces/[workspaceId]/members/route");
const memberRoute =
  await import("@/app/api/workspaces/[workspaceId]/members/[userId]/route");
const spaceMembersRoute =
  await import("@/app/api/spaces/[spaceId]/members/route");
const listsRoute = await import("@/app/api/lists/route");
const listRoute = await import("@/app/api/lists/[listId]/route");
const boardRoute = await import("@/app/api/lists/[listId]/board/route");
const folderRoute = await import("@/app/api/folders/[folderId]/route");
const { db } = await import("@/server/db");
const { getWorkspace } = await import("@/server/services/workspaces");

const BASE = "http://localhost:3000";
const OK = { origin: BASE, "content-type": "application/json" };
const send = (
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

const addMember = (
  workspaceId: string,
  body: object,
  actor: Actor = world.owner,
) =>
  callAs(
    actor,
    membersRoute.POST,
    send("POST", `/api/workspaces/${workspaceId}/members`, body),
    { workspaceId },
  );

const changeRole = (
  workspaceId: string,
  userId: string,
  role: string,
  actor: Actor = world.owner,
) =>
  callAs(
    actor,
    memberRoute.PATCH,
    send("PATCH", `/api/workspaces/${workspaceId}/members/${userId}`, {
      role,
    }),
    { workspaceId, userId },
  );

const boardOf = (listId: string, actor: Actor) =>
  callAs(actor, boardRoute.GET, send("GET", `/api/lists/${listId}/board`), {
    listId,
  });

describe("creating a workspace", () => {
  it("makes the creator OWNER and adds a public General space", async () => {
    const res = await callAs(
      world.stranger,
      workspacesRoute.POST,
      send("POST", "/api/workspaces", { name: "  Acme  " }),
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();

    const tree = await getWorkspace(world.stranger.id, id);
    expect(tree).toMatchObject({ name: "Acme", role: "OWNER" });
    expect(tree.spaces.map((s) => [s.name, s.isPrivate])).toEqual([
      ["General", false],
    ]);
    await db.workspace.delete({ where: { id } });
  });

  it.each([
    ["an empty name", { name: "   " }],
    ["a name over 80 characters", { name: "x".repeat(81) }],
    ["an unknown field", { name: "ok", ownerId: "someone" }],
  ])("rejects %s with 400", async (_label, body) => {
    const res = await callAs(
      world.owner,
      workspacesRoute.POST,
      send("POST", "/api/workspaces", body),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("rejects a body that is not JSON", async () => {
    const res = await callAs(
      world.owner,
      workspacesRoute.POST,
      new Request(`${BASE}/api/workspaces`, {
        method: "POST",
        headers: OK,
        body: "{nope",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });
});

describe("access control", () => {
  it("answers 401 without a session", async () => {
    const { workspaceId } = await createListFor(world);
    for (const res of [
      await callAs(null, workspacesRoute.GET, send("GET", "/api/workspaces")),
      await callAs(
        null,
        workspacesRoute.POST,
        send("POST", "/api/workspaces", { name: "x" }),
      ),
      await callAs(
        null,
        workspaceRoute.GET,
        send("GET", `/api/workspaces/${workspaceId}`),
        { workspaceId },
      ),
    ]) {
      expect(res.status).toBe(401);
    }
  });

  it("rejects a foreign or missing Origin on writes", async () => {
    const { workspaceId, spaceId } = await createListFor(world);
    const before = await snapshot(workspaceId);
    for (const headers of [
      { origin: "https://evil.example", "content-type": "application/json" },
      { "content-type": "application/json" },
    ] as Record<string, string>[]) {
      const results = [
        await callAs(
          world.owner,
          workspaceRoute.PATCH,
          send(
            "PATCH",
            `/api/workspaces/${workspaceId}`,
            { name: "x" },
            headers,
          ),
          { workspaceId },
        ),
        await callAs(
          world.owner,
          listsRoute.POST,
          send("POST", "/api/lists", { spaceId, name: "x" }, headers),
        ),
      ];
      for (const res of results) {
        expect(res.status).toBe(403);
        expect((await res.json()).error.code).toBe("CSRF_ORIGIN");
      }
    }
    expect(await snapshot(workspaceId)).toBe(before);
  });

  it("lists only the caller's workspaces, with their role", async () => {
    const { workspaceId } = await createListFor(world);
    const res = await callAs(
      world.guest,
      workspacesRoute.GET,
      send("GET", "/api/workspaces"),
    );
    const mine = (await res.json()) as { id: string; role: string }[];
    expect(mine.find((w) => w.id === workspaceId)?.role).toBe("GUEST");
    const others = await callAs(
      world.stranger,
      workspacesRoute.GET,
      send("GET", "/api/workspaces"),
    );
    expect(
      ((await others.json()) as { id: string }[]).some(
        (w) => w.id === workspaceId,
      ),
    ).toBe(false);
  });
});

describe("the workspace tree", () => {
  it("shows each person only the spaces they can see", async () => {
    const { workspaceId } = await createListFor(world, { privateSpace: true });
    const names = async (actor: Actor) =>
      (await getWorkspace(actor.id, workspaceId)).spaces
        .map((s) => s.name)
        .sort();

    expect(await names(world.owner)).toEqual(["General", "Private"]);
    expect(await names(world.admin)).toEqual(["General", "Private"]);
    expect(await names(world.member)).toEqual(["General"]); // public, private not listed
    expect(await names(world.guest)).toEqual(["General"]); // only where listed

    // An unlisted guest sees nothing, even a public space.
    const space = await db.space.findFirstOrThrow({
      where: { workspaceId, name: "General" },
    });
    await db.spaceMember.delete({
      where: { spaceId_userId: { spaceId: space.id, userId: world.guest.id } },
    });
    expect(await names(world.guest)).toEqual([]);
  });

  it("groups lists under their folder", async () => {
    const { workspaceId, spaceId, folderId } = await createListFor(world);
    const res = await callAs(
      world.owner,
      listsRoute.POST,
      send("POST", "/api/lists", { spaceId, folderId, name: "In folder" }),
    );
    expect(res.status).toBe(201);
    const tree = await getWorkspace(world.owner.id, workspaceId);
    const general = tree.spaces.find((s) => s.id === spaceId)!;
    expect(general.folders[0]!.lists.map((l) => l.name)).toEqual(["In folder"]);
    expect(general.lists.map((l) => l.name)).toEqual(["Fixture list"]);
  });
});

describe("role labels", () => {
  it("stores trimmed names, drops empty ones and changes no permission", async () => {
    const { workspaceId, listId, taskId } = await createListFor(world);
    const res = await callAs(
      world.admin,
      workspaceRoute.PATCH,
      send("PATCH", `/api/workspaces/${workspaceId}`, {
        roleLabels: { GUEST: "  Client ", MEMBER: "" },
      }),
      { workspaceId },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).roleLabels).toEqual({ GUEST: "Client" });

    // A "Client" is still a guest: reading is fine, writing is not.
    expect((await boardOf(listId, world.guest)).status).toBe(200);
    const write = await callAs(
      world.guest,
      (await import("@/app/api/lists/[listId]/tasks/[taskId]/route")).PATCH,
      send("PATCH", `/api/lists/${listId}/tasks/${taskId}`, {
        title: "x",
        expectedBoardVersion: 0,
      }),
      { listId, taskId },
    );
    expect(write.status).toBe(403);
  });

  it("rejects an unknown role and a name over 30 characters", async () => {
    const { workspaceId } = await createListFor(world);
    for (const roleLabels of [{ BOSS: "x" }, { GUEST: "x".repeat(31) }]) {
      const res = await callAs(
        world.owner,
        workspaceRoute.PATCH,
        send("PATCH", `/api/workspaces/${workspaceId}`, { roleLabels }),
        { workspaceId },
      );
      expect(res.status).toBe(400);
    }
  });
});

describe("lists", () => {
  it("are created with the generic flow: to do, in progress, done, discarded", async () => {
    const { spaceId } = await createListFor(world);
    const res = await callAs(
      world.admin,
      listsRoute.POST,
      send("POST", "/api/lists", { spaceId, name: "Board" }),
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    const columns = await db.boardColumn.findMany({
      where: { listId: id },
      orderBy: { position: "asc" },
    });
    expect(
      columns.map((c) => [c.name, c.category, c.isCommitmentPoint]),
    ).toEqual([
      ["To do", "BACKLOG", false],
      ["In progress", "ACTIVE", true],
      ["Done", "DONE", false],
      ["Discarded", "DISCARDED", false],
    ]);
  });

  it("leave nothing behind when creating the columns fails", async () => {
    const { spaceId } = await createListFor(world);
    await db.$executeRawUnsafe(`
      CREATE FUNCTION tf_fail_columns() RETURNS trigger AS $$
      BEGIN
        IF (SELECT name FROM "List" WHERE id = NEW."listId") = 'FAIL_COLUMNS' THEN
          RAISE EXCEPTION 'injected failure';
        END IF;
        RETURN NEW;
      END $$ LANGUAGE plpgsql`);
    await db.$executeRawUnsafe(
      `CREATE TRIGGER tf_fail_columns BEFORE INSERT ON "BoardColumn"
       FOR EACH ROW EXECUTE FUNCTION tf_fail_columns()`,
    );
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const res = await callAs(
        world.owner,
        listsRoute.POST,
        send("POST", "/api/lists", { spaceId, name: "FAIL_COLUMNS" }),
      );
      expect(res.status).toBe(500);
      expect(await db.list.count({ where: { name: "FAIL_COLUMNS" } })).toBe(0);
    } finally {
      vi.restoreAllMocks();
      await db.$executeRawUnsafe(
        `DROP TRIGGER tf_fail_columns ON "BoardColumn"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION tf_fail_columns()`);
    }
  });

  it("refuse a stale version on rename and delete with 409, changing nothing", async () => {
    const { workspaceId, listId } = await createListFor(world);
    const before = await snapshot(workspaceId);
    for (const [handler, method, body] of [
      [listRoute.PATCH, "PATCH", { name: "x", expectedBoardVersion: 3 }],
      [listRoute.DELETE, "DELETE", { expectedBoardVersion: 3 }],
    ] as const) {
      const res = await callAs(
        world.owner,
        handler,
        send(method, `/api/lists/${listId}`, body),
        { listId },
      );
      expect(res.status).toBe(409);
      expect((await res.json()).error.currentVersion).toBe(0);
    }
    expect(await snapshot(workspaceId)).toBe(before);
  });

  it("go away with their folder, and the people stay", async () => {
    const { workspaceId, spaceId, folderId } = await createListFor(world);
    await db.list.create({
      data: { spaceId, folderId, name: "Inside" },
    });
    const res = await callAs(
      world.owner,
      folderRoute.DELETE,
      send("DELETE", `/api/folders/${folderId}`),
      { folderId },
    );
    expect(res.status).toBe(204);
    expect(await db.list.count({ where: { name: "Inside", spaceId } })).toBe(0);
    expect(
      await db.list.count({ where: { name: "Fixture list" } }),
    ).toBeGreaterThan(0);
    expect(await db.workspaceMember.count({ where: { workspaceId } })).toBe(4);
  });
});

describe("deleting a workspace", () => {
  it("removes every space, list, task and membership, and keeps the users", async () => {
    const { workspaceId, listId } = await createListFor(world);
    const res = await callAs(
      world.owner,
      workspaceRoute.DELETE,
      send("DELETE", `/api/workspaces/${workspaceId}`),
      { workspaceId },
    );
    expect(res.status).toBe(204);
    expect(await db.workspace.count({ where: { id: workspaceId } })).toBe(0);
    expect(await db.list.count({ where: { id: listId } })).toBe(0);
    expect(await db.task.count({ where: { listId } })).toBe(0);
    expect(await db.workspaceMember.count({ where: { workspaceId } })).toBe(0);
    expect(await db.user.count({ where: { id: world.member.id } })).toBe(1);
  });
});

describe("members", () => {
  it("are added by exact email, ignoring case, and get access at once", async () => {
    const { workspaceId, listId } = await createListFor(world);
    expect((await boardOf(listId, world.candidate)).status).toBe(404);

    const res = await addMember(workspaceId, {
      email: world.candidate.email.toUpperCase(),
      role: "MEMBER",
    });
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body).toMatchObject({ userId: world.candidate.id, role: "MEMBER" });
    expect(JSON.stringify(body)).not.toMatch(/@|publicId|token/i);
    expect((await boardOf(listId, world.candidate)).status).toBe(200);
  });

  it("are refused when unknown, already in, or over 20", async () => {
    const { workspaceId } = await createListFor(world);
    const unknown = await addMember(workspaceId, {
      email: "nobody-here@example.test",
      role: "MEMBER",
    });
    expect(unknown.status).toBe(404);
    expect((await unknown.json()).error.code).toBe("USER_NOT_FOUND");

    const again = await addMember(workspaceId, {
      email: world.member.email,
      role: "MEMBER",
    });
    expect(again.status).toBe(409);
    expect((await again.json()).error.code).toBe("MEMBER_EXISTS");

    // 4 already; fill up to 20, then one more.
    const extra = await Promise.all(
      Array.from({ length: 16 }, (_, i) => createActor(`fill${i}`)),
    );
    await db.workspaceMember.createMany({
      data: extra.map((a) => ({ workspaceId, userId: a.id, role: "GUEST" })),
    });
    const full = await addMember(workspaceId, {
      email: world.candidate.email,
      role: "GUEST",
    });
    expect(full.status).toBe(409);
    expect((await full.json()).error.code).toBe("LIMIT_REACHED");
  });

  it("cannot pass the limit by racing: two adds at 19, one wins", async () => {
    const { workspaceId } = await createListFor(world);
    const extra = await Promise.all(
      Array.from({ length: 15 }, (_, i) => createActor(`race${i}`)),
    );
    await db.workspaceMember.createMany({
      data: extra.map((a) => ({ workspaceId, userId: a.id, role: "GUEST" })),
    });
    const late = await createActor("late");
    const results = await Promise.all([
      addMember(workspaceId, { email: world.candidate.email, role: "GUEST" }),
      addMember(workspaceId, { email: late.email, role: "GUEST" }),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
    expect(await db.workspaceMember.count({ where: { workspaceId } })).toBe(20);
  });

  it("removing one un-assigns their tasks, drops their space listings and ends access", async () => {
    const { workspaceId, spaceId, listId, taskId } = await createListFor(world);
    await db.spaceMember.create({
      data: { spaceId, workspaceId, userId: world.member.id },
    });
    const res = await callAs(
      world.admin,
      memberRoute.DELETE,
      send(
        "DELETE",
        `/api/workspaces/${workspaceId}/members/${world.member.id}`,
      ),
      { workspaceId, userId: world.member.id },
    );
    expect(res.status).toBe(204);
    const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.assigneeId).toBeNull();
    expect(task.createdById).toBe(world.owner.id);
    expect(
      await db.spaceMember.count({
        where: { userId: world.member.id, spaceId },
      }),
    ).toBe(0);
    expect((await boardOf(listId, world.member)).status).toBe(404);
  });

  it("a demotion that committed first is honoured", async () => {
    const { workspaceId } = await createListFor(world);
    expect(
      (await changeRole(workspaceId, world.admin.id, "MEMBER")).status,
    ).toBe(200);
    const res = await addMember(
      workspaceId,
      { email: world.candidate.email, role: "GUEST" },
      world.admin,
    );
    expect(res.status).toBe(403);
  });

  it("only people in the workspace can be listed in one of its spaces", async () => {
    const { spaceId } = await createListFor(world);
    const res = await callAs(
      world.owner,
      spaceMembersRoute.POST,
      send("POST", `/api/spaces/${spaceId}/members`, {
        userId: world.stranger.id,
      }),
      { spaceId },
    );
    expect(res.status).toBe(404);
  });
});
