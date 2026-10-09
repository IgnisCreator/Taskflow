import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, createActor } from "../helpers/actors";
import {
  createProjectFor,
  createWorld,
  snapshot,
  type World,
} from "../helpers/world";

const { db } = await import("@/server/db");
const project = await import("@/app/api/projects/[projectId]/route");
const members = await import("@/app/api/projects/[projectId]/members/route");
const member =
  await import("@/app/api/projects/[projectId]/members/[userId]/route");

const BASE = "http://localhost:3000";
const HEADERS = { origin: BASE, "content-type": "application/json" };
const href = (projectId: string, tail = "") =>
  `${BASE}/api/projects/${projectId}${tail}`;
const send = (method: string, url: string, body?: object) =>
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

const add = (projectId: string, body: object, actor = world.owner) =>
  callAs(actor, members.POST, send("POST", href(projectId, "/members"), body), {
    projectId,
  });

describe("adding a member by public ID", () => {
  it("gives the new member access and never exposes emails or public IDs", async () => {
    const { projectId } = await createProjectFor(world);

    const res = await add(projectId, {
      publicId: world.candidatePublicId,
      role: "VIEWER",
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(201);
    const created = await res.json();
    expect(created).toMatchObject({
      role: "VIEWER",
      isOwner: false,
      boardVersion: 1,
    });

    const get = await callAs(
      world.candidate,
      project.GET,
      send("GET", href(projectId)),
      { projectId },
    );
    expect(get.status).toBe(200);

    const list = await callAs(
      world.owner,
      members.GET,
      send("GET", href(projectId, "/members")),
      { projectId },
    );
    const text = JSON.stringify(await list.json());
    expect(text).not.toMatch(/@example\.test|publicId|token/i);
  });

  it.each([
    [
      "an unknown public ID",
      { publicId: crypto.randomUUID() },
      404,
      "USER_NOT_FOUND",
    ],
    [
      "a malformed public ID",
      { publicId: "not-a-uuid" },
      400,
      "VALIDATION_ERROR",
    ],
    [
      "the OWNER role",
      { publicId: crypto.randomUUID(), role: "OWNER" },
      400,
      "VALIDATION_ERROR",
    ],
    [
      "an unexpected field",
      { publicId: crypto.randomUUID(), userId: "x" },
      400,
      "VALIDATION_ERROR",
    ],
  ])("rejects %s", async (_label, extra, status, code) => {
    const { projectId } = await createProjectFor(world);
    const before = await snapshot(projectId);
    const res = await add(projectId, {
      role: "MEMBER",
      expectedBoardVersion: 0,
      ...extra,
    });
    expect(res.status).toBe(status);
    expect((await res.json()).error.code).toBe(code);
    expect(await snapshot(projectId)).toBe(before);
  });

  it("rejects someone who is already a member", async () => {
    const { projectId } = await createProjectFor(world);
    const viewer = await db.user.findUniqueOrThrow({
      where: { id: world.viewer.id },
    });
    const res = await add(projectId, {
      publicId: viewer.publicId,
      role: "MEMBER",
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("MEMBER_EXISTS");
  });

  it("stops at five members", async () => {
    const { projectId } = await createProjectFor(world); // owner, admin, member, viewer = 4
    const fifth = await createActor("fifth");
    const sixth = await createActor("sixth");
    const publicId = async (id: string) =>
      (await db.user.findUniqueOrThrow({ where: { id } })).publicId;

    const ok = await add(projectId, {
      publicId: await publicId(fifth.id),
      role: "MEMBER",
      expectedBoardVersion: 0,
    });
    expect(ok.status).toBe(201);

    const over = await add(projectId, {
      publicId: await publicId(sixth.id),
      role: "MEMBER",
      expectedBoardVersion: 1,
    });
    expect(over.status).toBe(409);
    expect((await over.json()).error.code).toBe("LIMIT_REACHED");
    expect(await db.projectMember.count({ where: { projectId } })).toBe(5);
  });
});

describe("removing a member", () => {
  it("un-assigns their tasks, keeps the author, and ends their access", async () => {
    const { projectId, taskId } = await createProjectFor(world);

    const res = await callAs(
      world.admin,
      member.DELETE,
      send("DELETE", href(projectId, `/members/${world.member.id}`), {
        expectedBoardVersion: 0,
      }),
      { projectId, userId: world.member.id },
    );
    expect(res.status).toBe(204);

    const task = await db.task.findUniqueOrThrow({ where: { id: taskId } });
    expect(task.assigneeId).toBeNull();
    expect(task.createdById).toBe(world.owner.id);

    // The removed member's existing session no longer reaches the project.
    const get = await callAs(
      world.member,
      project.GET,
      send("GET", href(projectId)),
      { projectId },
    );
    expect(get.status).toBe(404);
  });
});

describe("project settings", () => {
  const patch = (projectId: string, body: object, actor = world.owner) =>
    callAs(actor, project.PATCH, send("PATCH", href(projectId), body), {
      projectId,
    });

  it("renames, trims, clears the description and bumps the version", async () => {
    const { projectId } = await createProjectFor(world);
    const res = await patch(projectId, {
      name: "  Renamed  ",
      description: "   ",
      expectedBoardVersion: 0,
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({
      name: "Renamed",
      description: null,
      boardVersion: 1,
    });
  });

  it.each([
    ["nothing to change", { expectedBoardVersion: 0 }],
    ["an empty name", { name: "  ", expectedBoardVersion: 0 }],
    ["a client-chosen owner", { ownerId: "x", expectedBoardVersion: 0 }],
  ])("rejects %s with 400", async (_label, body) => {
    const { projectId } = await createProjectFor(world);
    const res = await patch(projectId, body);
    expect(res.status).toBe(400);
  });
});

describe("the board version", () => {
  it.each([
    [
      "rename",
      (id: string) =>
        callAs(
          world.owner,
          project.PATCH,
          send("PATCH", href(id), { name: "x", expectedBoardVersion: 7 }),
          { projectId: id },
        ),
    ],
    [
      "add member",
      (id: string) =>
        add(id, {
          publicId: world.candidatePublicId,
          role: "MEMBER",
          expectedBoardVersion: 7,
        }),
    ],
    [
      "change role",
      (id: string) =>
        callAs(
          world.owner,
          member.PATCH,
          send("PATCH", href(id, `/members/${world.member.id}`), {
            role: "VIEWER",
            expectedBoardVersion: 7,
          }),
          { projectId: id, userId: world.member.id },
        ),
    ],
    [
      "remove member",
      (id: string) =>
        callAs(
          world.owner,
          member.DELETE,
          send("DELETE", href(id, `/members/${world.member.id}`), {
            expectedBoardVersion: 7,
          }),
          { projectId: id, userId: world.member.id },
        ),
    ],
  ])(
    "a stale version on %s is a 409 that changes nothing",
    async (_label, call) => {
      const { projectId } = await createProjectFor(world);
      const before = await snapshot(projectId);
      const res = await call(projectId);
      expect(res.status).toBe(409);
      expect((await res.json()).error).toMatchObject({
        code: "BOARD_CONFLICT",
        currentVersion: 0,
      });
      expect(await snapshot(projectId)).toBe(before);
    },
  );

  it("serialises two writes that carry the same version: one wins, one gets 409", async () => {
    const { projectId } = await createProjectFor(world);

    // The owner demotes the admin while the admin tries to add someone, both at version 0.
    const [demote, addByAdmin] = await Promise.all([
      callAs(
        world.owner,
        member.PATCH,
        send("PATCH", href(projectId, `/members/${world.admin.id}`), {
          role: "VIEWER",
          expectedBoardVersion: 0,
        }),
        { projectId, userId: world.admin.id },
      ),
      add(
        projectId,
        {
          publicId: world.candidatePublicId,
          role: "MEMBER",
          expectedBoardVersion: 0,
        },
        world.admin,
      ),
    ]);

    const statuses = [demote.status, addByAdmin.status].sort();
    expect(statuses[1]).toBe(409);
    expect([200, 201]).toContain(statuses[0]);
    const row = await db.project.findUniqueOrThrow({
      where: { id: projectId },
    });
    expect(row.boardVersion).toBe(1);
  });

  it("honours a demotion that committed first", async () => {
    const { projectId } = await createProjectFor(world);
    const demote = await callAs(
      world.owner,
      member.PATCH,
      send("PATCH", href(projectId, `/members/${world.admin.id}`), {
        role: "VIEWER",
        expectedBoardVersion: 0,
      }),
      { projectId, userId: world.admin.id },
    );
    expect(demote.status).toBe(200);

    const res = await add(
      projectId,
      {
        publicId: world.candidatePublicId,
        role: "MEMBER",
        expectedBoardVersion: 1,
      },
      world.admin,
    );
    expect(res.status).toBe(403);
  });
});
