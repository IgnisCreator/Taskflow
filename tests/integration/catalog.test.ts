import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const workspacesRoute = await import("@/app/api/workspaces/route");
const catalogRoute =
  await import("@/app/api/workspaces/[workspaceId]/catalog/route");
const kindRoute =
  await import("@/app/api/workspaces/[workspaceId]/catalog/[kind]/route");
const itemRoute = await import("@/app/api/catalog/[kind]/[itemId]/route");
const taskRoute = await import("@/app/api/lists/[listId]/tasks/[taskId]/route");

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

const add = (
  workspaceId: string,
  kind: string,
  name: string,
  actor: Actor = world.owner,
) =>
  callAs(
    actor,
    kindRoute.POST,
    req("POST", `/api/workspaces/${workspaceId}/catalog/${kind}`, { name }),
    {
      workspaceId,
      kind,
    },
  );
const rename = (
  kind: string,
  itemId: string,
  name: string,
  actor: Actor = world.owner,
) =>
  callAs(
    actor,
    itemRoute.PATCH,
    req("PATCH", `/api/catalog/${kind}/${itemId}`, { name }),
    { kind, itemId },
  );
const remove = (kind: string, itemId: string, actor: Actor = world.owner) =>
  callAs(
    actor,
    itemRoute.DELETE,
    req("DELETE", `/api/catalog/${kind}/${itemId}`),
    { kind, itemId },
  );

describe("task types and labels", () => {
  it("a new workspace starts with Task, Bug, Feature and Request", async () => {
    const res = await callAs(
      world.stranger,
      workspacesRoute.POST,
      req("POST", "/api/workspaces", { name: "Fresh" }),
    );
    const { id } = await res.json();
    const catalog = await (
      await callAs(
        world.stranger,
        catalogRoute.GET,
        req("GET", `/api/workspaces/${id}/catalog`),
        { workspaceId: id },
      )
    ).json();
    expect(catalog.types.map((t: { name: string }) => t.name)).toEqual([
      "Bug",
      "Feature",
      "Request",
      "Task",
    ]);
    expect(catalog.labels).toEqual([]);
    await db.workspace.delete({ where: { id } });
  });

  it.each(["types", "labels"])(
    "an admin adds, renames and deletes in %s; a member only reads",
    async (kind) => {
      const { workspaceId } = await createListFor(world);
      const created = await add(workspaceId, kind, "  Spike  ", world.admin);
      expect(created.status).toBe(201);
      const { id, name } = await created.json();
      expect(name).toBe("Spike");

      expect((await add(workspaceId, kind, "Nope", world.member)).status).toBe(
        403,
      );
      expect((await rename(kind, id, "Nope", world.member)).status).toBe(403);
      expect((await remove(kind, id, world.guest)).status).toBe(403);

      expect(await (await rename(kind, id, "Research")).json()).toMatchObject({
        name: "Research",
      });
      expect((await remove(kind, id)).status).toBe(204);
      expect((await remove(kind, id)).status).toBe(404);

      const list = await callAs(
        world.member,
        catalogRoute.GET,
        req("GET", `/api/workspaces/${workspaceId}/catalog`),
        {
          workspaceId,
        },
      );
      expect(list.status).toBe(200);
    },
  );

  it.each(["types", "labels"])(
    "a name is unique in a workspace (%s), but may repeat in another",
    async (kind) => {
      const a = await createListFor(world);
      const b = await createListFor(world);
      expect((await add(a.workspaceId, kind, "Same")).status).toBe(201);
      const again = await add(a.workspaceId, kind, "Same");
      expect(again.status).toBe(409);
      expect((await again.json()).error.code).toBe("NAME_TAKEN");
      expect((await add(b.workspaceId, kind, "Same")).status).toBe(201);

      const other = await (await add(a.workspaceId, kind, "Other")).json();
      expect((await rename(kind, other.id, "Same")).status).toBe(409);
    },
  );

  it.each([
    ["types", 30],
    ["labels", 100],
  ] as const)("%s stop at %i per workspace", async (kind, limit) => {
    const { workspaceId } = await createListFor(world);
    // Types and labels share the same shape for what this test needs.
    const table = (kind === "types"
      ? db.workItemType
      : db.label) as unknown as {
      count(args: object): Promise<number>;
      createMany(args: object): Promise<unknown>;
    };
    const have = await table.count({ where: { workspaceId } });
    await table.createMany({
      data: Array.from({ length: limit - have }, (_, i) => ({
        workspaceId,
        name: `Filler ${i}`,
      })),
    });
    const res = await add(workspaceId, kind, "One more");
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
  });

  it("deleting a type leaves its tasks without a type, deleting a label takes it off its tasks", async () => {
    const { listId, taskId, typeId, labelId } = await createListFor(world);
    await callAs(
      world.owner,
      taskRoute.PATCH,
      req("PATCH", `/api/lists/${listId}/tasks/${taskId}`, {
        typeId,
        labelIds: [labelId],
        expectedBoardVersion: 0,
      }),
      { listId, taskId },
    );
    expect((await remove("types", typeId)).status).toBe(204);
    expect((await remove("labels", labelId)).status).toBe(204);

    const task = await db.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { labels: true },
    });
    expect(task.typeId).toBeNull();
    expect(task.labels).toEqual([]);
  });

  it("answers 404 to an unknown kind and to someone outside the workspace, 400 to a bad name", async () => {
    const { workspaceId, typeId } = await createListFor(world);
    expect((await add(workspaceId, "colours", "x")).status).toBe(404);
    expect((await rename("colours", typeId, "x")).status).toBe(404);
    expect((await add(workspaceId, "types", "x", world.stranger)).status).toBe(
      404,
    );
    expect((await rename("types", typeId, "x", world.stranger)).status).toBe(
      404,
    );
    for (const name of ["   ", "x".repeat(41)]) {
      expect((await add(workspaceId, "types", name)).status).toBe(400);
    }
    // A label id is not a type id, and the other way round.
    expect((await rename("labels", typeId, "x")).status).toBe(404);
  });
});
