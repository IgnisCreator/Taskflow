import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData, type Actor } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const templatesRoute =
  await import("@/app/api/workspaces/[workspaceId]/templates/route");
const templateRoute = await import("@/app/api/templates/[templateId]/route");
const spaceRoute = await import("@/app/api/spaces/[spaceId]/route");
const folderRoute = await import("@/app/api/folders/[folderId]/route");
const listsRoute = await import("@/app/api/lists/route");

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

const saveTemplate = (
  workspaceId: string,
  body: object,
  actor: Actor = world.owner,
) =>
  callAs(
    actor,
    templatesRoute.POST,
    req("POST", `/api/workspaces/${workspaceId}/templates`, body),
    {
      workspaceId,
    },
  );
const setSpaceDefault = (spaceId: string, defaultTemplate: string | null) =>
  callAs(
    world.owner,
    spaceRoute.PATCH,
    req("PATCH", `/api/spaces/${spaceId}`, { defaultTemplate }),
    { spaceId },
  );
const setFolderDefault = (folderId: string, defaultTemplate: string | null) =>
  callAs(
    world.owner,
    folderRoute.PATCH,
    req("PATCH", `/api/folders/${folderId}`, { defaultTemplate }),
    {
      folderId,
    },
  );
const newList = async (spaceId: string, folderId: string | null = null) => {
  const res = await callAs(
    world.owner,
    listsRoute.POST,
    req("POST", "/api/lists", { spaceId, folderId, name: "Fresh" }),
  );
  expect(res.status).toBe(201);
  const { id } = await res.json();
  return (
    await db.boardColumn.findMany({
      where: { listId: id },
      orderBy: { position: "asc" },
    })
  ).map((c) => c.name);
};

/** A list in the fixture workspace with an extra "Review" stage, saved as the template "Mine". */
async function fixtureWithTemplate() {
  const fixture = await createListFor(world);
  const res = await saveTemplate(fixture.workspaceId, {
    name: "Mine",
    fromListId: fixture.listId,
  });
  expect(res.status).toBe(201);
  return { ...fixture, templateId: (await res.json()).id as string };
}
const MINE = ["To do", "In progress", "In review", "Done", "Discarded"];
const GENERIC = ["To do", "In progress", "Done", "Discarded"];

describe("organisation templates", () => {
  it("are saved from a list, in order, with categories, limits and policies", async () => {
    const { templateId } = await fixtureWithTemplate();
    const row = await db.workflowTemplate.findUniqueOrThrow({
      where: { id: templateId },
    });
    const stages = row.stages as {
      name: string;
      category: string;
      isCommitmentPoint: boolean;
    }[];
    expect(stages.map((s) => s.name)).toEqual(MINE);
    expect(stages.map((s) => s.category)).toEqual([
      "BACKLOG",
      "ACTIVE",
      "ACTIVE",
      "DONE",
      "DISCARDED",
    ]);
    expect(
      stages.filter((s) => s.isCommitmentPoint).map((s) => s.name),
    ).toEqual(["In progress"]);
  });

  it("are listed with the system ones for any member, and for nobody else", async () => {
    const { workspaceId } = await fixtureWithTemplate();
    const list = (actor: Actor | null) =>
      callAs(
        actor,
        templatesRoute.GET,
        req("GET", `/api/workspaces/${workspaceId}/templates`),
        { workspaceId },
      );

    const res = await list(world.guest);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.system.map((t: { ref: string }) => t.ref)).toContain(
      "system:software",
    );
    expect(body.organisation.map((t: { name: string }) => t.name)).toEqual([
      "Mine",
    ]);
    expect((await list(world.stranger)).status).toBe(404);
    expect((await list(null)).status).toBe(401);
  });

  it("cannot be saved from a list that is not a valid flow, or from another workspace", async () => {
    const { workspaceId } = await fixtureWithTemplate();
    const broken = await createListFor(world);
    await db.boardColumn.deleteMany({
      where: { listId: broken.listId, category: "DISCARDED" },
    });
    const invalid = await saveTemplate(workspaceId, {
      name: "Bad",
      fromListId: broken.listId,
    });
    expect(invalid.status).toBe(404); // a list of another workspace is simply not found

    const same = await createListFor(world);
    await db.boardColumn.deleteMany({
      where: { listId: same.listId, category: "DISCARDED" },
    });
    const res = await saveTemplate(same.workspaceId, {
      name: "Bad",
      fromListId: same.listId,
    });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_FLOW");
  });

  it("stop at 30 per workspace", async () => {
    const { workspaceId, listId } = await createListFor(world);
    await db.workflowTemplate.createMany({
      data: Array.from({ length: 30 }, (_, i) => ({
        workspaceId,
        name: `T${i}`,
        stages: [],
      })),
    });
    const res = await saveTemplate(workspaceId, {
      name: "One more",
      fromListId: listId,
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("LIMIT_REACHED");
  });

  it("can be renamed and refreshed from a list", async () => {
    const { templateId, listId } = await fixtureWithTemplate();
    await db.boardColumn.deleteMany({ where: { listId, name: "In review" } });
    const res = await callAs(
      world.admin,
      templateRoute.PATCH,
      req("PATCH", `/api/templates/${templateId}`, {
        name: "Renamed",
        fromListId: listId,
      }),
      { templateId },
    );
    expect(res.status).toBe(200);
    const row = await db.workflowTemplate.findUniqueOrThrow({
      where: { id: templateId },
    });
    expect(row.name).toBe("Renamed");
    expect((row.stages as { name: string }[]).map((s) => s.name)).toEqual(
      GENERIC.map((n) => n),
    );
  });
});

describe("the flow a new list gets", () => {
  it("is the generic one without any default", async () => {
    const { spaceId } = await createListFor(world);
    expect(await newList(spaceId)).toEqual(GENERIC);
  });

  it("is the space default when there is one", async () => {
    const { spaceId, templateId } = await fixtureWithTemplate();
    expect((await setSpaceDefault(spaceId, templateId)).status).toBe(200);
    expect(await newList(spaceId)).toEqual(MINE);
    expect((await setSpaceDefault(spaceId, "system:software")).status).toBe(
      200,
    );
    expect((await newList(spaceId)).slice(0, 2)).toEqual(["Backlog", "Ready"]);
  });

  it("is the folder default over the space default", async () => {
    const { spaceId, folderId, templateId } = await fixtureWithTemplate();
    await setSpaceDefault(spaceId, "system:software");
    await setFolderDefault(folderId, templateId);
    expect(await newList(spaceId, folderId)).toEqual(MINE);
    expect((await newList(spaceId)).slice(0, 2)).toEqual(["Backlog", "Ready"]); // outside the folder
  });

  it("is the one asked for, over any default", async () => {
    const { spaceId, templateId } = await fixtureWithTemplate();
    await setSpaceDefault(spaceId, "system:software");
    const res = await callAs(
      world.owner,
      listsRoute.POST,
      req("POST", "/api/lists", { spaceId, name: "X", templateId }),
    );
    const { id } = await res.json();
    const names = (
      await db.boardColumn.findMany({
        where: { listId: id },
        orderBy: { position: "asc" },
      })
    ).map((c) => c.name);
    expect(names).toEqual(MINE);
  });

  it("falls back when the default template was deleted, and deleting clears the default", async () => {
    const { spaceId, folderId, templateId } = await fixtureWithTemplate();
    await setSpaceDefault(spaceId, templateId);
    await setFolderDefault(folderId, templateId);

    const res = await callAs(
      world.admin,
      templateRoute.DELETE,
      req("DELETE", `/api/templates/${templateId}`),
      {
        templateId,
      },
    );
    expect(res.status).toBe(204);
    expect(
      (await db.space.findUniqueOrThrow({ where: { id: spaceId } }))
        .defaultTemplate,
    ).toBeNull();
    expect(
      (await db.folder.findUniqueOrThrow({ where: { id: folderId } }))
        .defaultTemplate,
    ).toBeNull();
    expect(await newList(spaceId, folderId)).toEqual(GENERIC);
  });

  it("cannot use a template that does not exist or belongs to another workspace as a default", async () => {
    const mine = await fixtureWithTemplate();
    const other = await fixtureWithTemplate();
    for (const ref of ["system:nope", "not-a-template", other.templateId]) {
      const res = await setSpaceDefault(mine.spaceId, ref);
      expect(res.status).toBe(400);
      expect((await res.json()).error.code).toBe("INVALID_TEMPLATE");
    }
    expect(
      (await db.space.findUniqueOrThrow({ where: { id: mine.spaceId } }))
        .defaultTemplate,
    ).toBeNull();
    // Nor to create a list in this workspace.
    const res = await callAs(
      world.owner,
      listsRoute.POST,
      req("POST", "/api/lists", {
        spaceId: mine.spaceId,
        name: "X",
        templateId: other.templateId,
      }),
    );
    expect(res.status).toBe(400);
  });
});
