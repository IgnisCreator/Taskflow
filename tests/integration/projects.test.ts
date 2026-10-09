import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  callAs,
  cleanupTestData,
  createActor,
  type Actor,
} from "../helpers/actors";

const { db } = await import("@/server/db");
const projects = await import("@/app/api/projects/route");
const project = await import("@/app/api/projects/[projectId]/route");

const BASE = "http://localhost:3000";
const OK_ORIGIN = { origin: BASE, "content-type": "application/json" };

const post = (body: unknown, headers: Record<string, string> = OK_ORIGIN) =>
  new Request(`${BASE}/api/projects`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });

const list = (query = "") =>
  new Request(`${BASE}/api/projects${query}`, { method: "GET" });

const one = (
  id: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = OK_ORIGIN,
) =>
  new Request(`${BASE}/api/projects/${id}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function createAs(actor: Actor, name = "Roadmap", description?: string) {
  const res = await callAs(actor, projects.POST, post({ name, description }));
  expect(res.status).toBe(201);
  return res.json();
}

let owner: Actor;
let stranger: Actor;

beforeAll(async () => {
  await cleanupTestData();
  owner = await createActor("owner");
  stranger = await createActor("stranger");
});
afterAll(cleanupTestData);

describe("creating a project", () => {
  it("creates the project, the owner's ADMIN membership and four ordered columns", async () => {
    const created = await createAs(owner, "  Roadmap  ", "  First  ");

    expect(created).toMatchObject({
      name: "Roadmap",
      description: "First",
      ownerId: owner.id,
      boardVersion: 0,
      role: "ADMIN",
      isOwner: true,
    });
    const members = await db.projectMember.findMany({
      where: { projectId: created.id },
    });
    expect(members).toEqual([
      { projectId: created.id, userId: owner.id, role: "ADMIN" },
    ]);
    const columns = await db.boardColumn.findMany({
      where: { projectId: created.id },
      orderBy: { position: "asc" },
    });
    expect(columns.map((c) => [c.position, c.name])).toEqual([
      [0, "To do"],
      [1, "In progress"],
      [2, "In review"],
      [3, "Done"],
    ]);
  });

  it("leaves nothing behind when creating the columns fails", async () => {
    await db.$executeRawUnsafe(`
      CREATE FUNCTION tf_fail_columns() RETURNS trigger AS $$
      BEGIN
        IF (SELECT name FROM "Project" WHERE id = NEW."projectId") = 'FAIL_COLUMNS' THEN
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
        owner,
        projects.POST,
        post({ name: "FAIL_COLUMNS" }),
      );
      expect(res.status).toBe(500);
      expect((await res.json()).error.code).toBe("INTERNAL");

      expect(await db.project.count({ where: { name: "FAIL_COLUMNS" } })).toBe(
        0,
      );
      const orphan = await db.$queryRaw<{ n: number }[]>`
        SELECT count(*)::int AS n FROM "ProjectMember" pm
        LEFT JOIN "Project" p ON p.id = pm."projectId" WHERE p.id IS NULL`;
      expect(orphan[0]?.n).toBe(0);
    } finally {
      vi.restoreAllMocks();
      await db.$executeRawUnsafe(
        `DROP TRIGGER tf_fail_columns ON "BoardColumn"`,
      );
      await db.$executeRawUnsafe(`DROP FUNCTION tf_fail_columns()`);
    }
  });

  it.each([
    ["an empty name", { name: "   " }, "name"],
    ["a name over 80 characters", { name: "x".repeat(81) }, "name"],
    [
      "a description over 5000 characters",
      { name: "ok", description: "x".repeat(5001) },
      "description",
    ],
    ["an ownerId sent by the client", { name: "ok", ownerId: "someone" }, ""],
  ])("rejects %s with 400", async (_label, body, field) => {
    const res = await callAs(owner, projects.POST, post(body));
    expect(res.status).toBe(400);
    const { error } = await res.json();
    expect(error.code).toBe("VALIDATION_ERROR");
    expect(error.requestId).toBeTruthy();
    if (field) expect(error.fields[field]).toBeTruthy();
  });

  it("rejects a body that is not JSON", async () => {
    const res = await callAs(
      owner,
      projects.POST,
      new Request(`${BASE}/api/projects`, {
        method: "POST",
        headers: OK_ORIGIN,
        body: "{nope",
      }),
    );
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_JSON");
  });
});

describe("access control", () => {
  it("answers 401 to every project endpoint without a session", async () => {
    const created = await createAs(owner);
    const calls = [
      callAs(null, projects.GET, list()),
      callAs(null, projects.POST, post({ name: "x" })),
      callAs(null, project.GET, one(created.id, "GET"), {
        projectId: created.id,
      }),
      callAs(
        null,
        project.DELETE,
        one(created.id, "DELETE", { expectedBoardVersion: 0 }),
        { projectId: created.id },
      ),
    ];
    for (const res of await Promise.all(calls)) {
      expect(res.status).toBe(401);
    }
    expect(await db.project.count({ where: { id: created.id } })).toBe(1);
  });

  it("rejects a foreign or missing Origin on writes", async () => {
    const created = await createAs(owner);
    for (const origin of ["https://evil.example", undefined]) {
      const headers: Record<string, string> = {
        "content-type": "application/json",
        ...(origin ? { origin } : {}),
      };
      const create = await callAs(
        owner,
        projects.POST,
        post({ name: "x" }, headers),
      );
      const remove = await callAs(
        owner,
        project.DELETE,
        one(created.id, "DELETE", { expectedBoardVersion: 0 }, headers),
        { projectId: created.id },
      );
      expect(create.status).toBe(403);
      expect((await create.json()).error.code).toBe("CSRF_ORIGIN");
      expect(remove.status).toBe(403);
    }
    expect(await db.project.count({ where: { id: created.id } })).toBe(1);
  });

  it("does not reveal a project to someone outside it", async () => {
    const created = await createAs(owner, "Secret");

    const get = await callAs(stranger, project.GET, one(created.id, "GET"), {
      projectId: created.id,
    });
    expect(get.status).toBe(404);

    const del = await callAs(
      stranger,
      project.DELETE,
      one(created.id, "DELETE", { expectedBoardVersion: 0 }),
      { projectId: created.id },
    );
    expect(del.status).toBe(404);

    const listed = await (await callAs(stranger, projects.GET, list())).json();
    expect(listed.items.map((p: { id: string }) => p.id)).not.toContain(
      created.id,
    );
    expect(await db.project.count({ where: { id: created.id } })).toBe(1);
  });

  it.each(["ADMIN", "MEMBER", "VIEWER"] as const)(
    "lets a %s member see the project but not delete it",
    async (role) => {
      const created = await createAs(owner);
      const member = await createActor(role.toLowerCase());
      await db.projectMember.create({
        data: { projectId: created.id, userId: member.id, role },
      });

      const get = await callAs(member, project.GET, one(created.id, "GET"), {
        projectId: created.id,
      });
      expect(get.status).toBe(200);
      expect(await get.json()).toMatchObject({ role, isOwner: false });

      const del = await callAs(
        member,
        project.DELETE,
        one(created.id, "DELETE", { expectedBoardVersion: 0 }),
        { projectId: created.id },
      );
      expect(del.status).toBe(403);
      expect(await db.project.count({ where: { id: created.id } })).toBe(1);
    },
  );
});

describe("deleting a project", () => {
  it("refuses a stale version with 409 and keeps everything", async () => {
    const created = await createAs(owner);
    await db.project.update({
      where: { id: created.id },
      data: { boardVersion: 5 },
    });

    const res = await callAs(
      owner,
      project.DELETE,
      one(created.id, "DELETE", { expectedBoardVersion: 0 }),
      { projectId: created.id },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatchObject({
      code: "BOARD_CONFLICT",
      currentVersion: 5,
    });
    expect(await db.project.count({ where: { id: created.id } })).toBe(1);
  });

  it("deletes the project with its tasks, columns and members, and keeps the users", async () => {
    const created = await createAs(owner);
    const teammate = await createActor("teammate");
    await db.projectMember.create({
      data: { projectId: created.id, userId: teammate.id, role: "MEMBER" },
    });
    const column = await db.boardColumn.findFirstOrThrow({
      where: { projectId: created.id, position: 0 },
    });
    await db.task.create({
      data: {
        projectId: created.id,
        columnId: column.id,
        title: "Assigned task",
        position: 0,
        assigneeId: teammate.id,
        createdById: owner.id,
      },
    });

    const res = await callAs(
      owner,
      project.DELETE,
      one(created.id, "DELETE", { expectedBoardVersion: 0 }),
      { projectId: created.id },
    );
    expect(res.status).toBe(204);

    const where = { projectId: created.id };
    expect(await db.project.count({ where: { id: created.id } })).toBe(0);
    expect(await db.task.count({ where })).toBe(0);
    expect(await db.boardColumn.count({ where })).toBe(0);
    expect(await db.projectMember.count({ where })).toBe(0);
    expect(
      await db.user.count({ where: { id: { in: [owner.id, teammate.id] } } }),
    ).toBe(2);
  });
});

describe("listing projects", () => {
  it("returns only the caller's projects, newest first, with cursor pages", async () => {
    const lister = await createActor("lister");
    const a = await createAs(lister, "A");
    const b = await createAs(lister, "B");
    const c = await createAs(lister, "C");
    await createAs(owner, "Not visible to lister");

    const first = await (
      await callAs(lister, projects.GET, list("?limit=2"))
    ).json();
    expect(first.items.map((p: { name: string }) => p.name)).toEqual([
      "C",
      "B",
    ]);
    expect(first.nextCursor).toBe(b.id);

    const second = await (
      await callAs(
        lister,
        projects.GET,
        list(`?limit=2&cursor=${first.nextCursor}`),
      )
    ).json();
    expect(second.items.map((p: { id: string }) => p.id)).toEqual([a.id]);
    expect(second.nextCursor).toBeNull();
    expect(c.id).toBeTruthy();
  });

  it("rejects a page size above 50", async () => {
    const res = await callAs(owner, projects.GET, list("?limit=51"));
    expect(res.status).toBe(400);
  });
});
