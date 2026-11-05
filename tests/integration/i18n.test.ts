import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestData, callAs, type Actor } from "../helpers/actors";
import { createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const { createWorkspace } = await import("@/server/services/workspaces");
const { listTemplates } = await import("@/server/services/templates");
const { SYSTEM_TEMPLATES } = await import("@/lib/workflow");
const listsRoute = await import("@/app/api/lists/route");

const BASE = "http://localhost:3000";
const post = (body: object) =>
  new Request(`${BASE}/api/lists`, {
    method: "POST",
    headers: { origin: BASE, "content-type": "application/json" },
    body: JSON.stringify(body),
  });

let world: World;
let spaceId: string;
let workspaceId: string;
/** The same signed-in person asking in Spanish (the language cookie travels with the session). */
const inSpanish = (actor: Actor): Actor => ({
  ...actor,
  cookie: `${actor.cookie}; lang=es`,
});

beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
  workspaceId = (await createWorkspace(world.owner.id, "I18n")).id;
  spaceId = (await db.space.findFirstOrThrow({ where: { workspaceId } })).id;
});
afterAll(cleanupTestData);

const stagesOf = async (listId: string) =>
  db.boardColumn.findMany({
    where: { listId },
    orderBy: { position: "asc" },
    select: {
      name: true,
      category: true,
      wipLimit: true,
      isCommitmentPoint: true,
      policy: true,
    },
  });

async function newList(actor: Actor, templateId: string | null) {
  const res = await callAs(
    actor,
    listsRoute.POST,
    post({ spaceId, name: "List", templateId, folderId: null }),
  );
  expect(res.status).toBe(201);
  return (await res.json()).id as string;
}

describe("a new list gets the stage names of the language it is made in", () => {
  it("English by default, Spanish with the cookie, the same categories, limits and commitment point", async () => {
    const english = await stagesOf(
      await newList(world.owner, "system:software"),
    );
    const spanish = await stagesOf(
      await newList(inSpanish(world.owner), "system:software"),
    );
    const reference = SYSTEM_TEMPLATES.software!.stages;
    expect(english.map((s) => s.name)).toEqual(reference.map((s) => s.name));
    expect(spanish.map((s) => s.name)).toContain("Revisión de código");
    expect(spanish.map((s) => s.name)).not.toContain("Code review");
    const shape = (rows: typeof english) =>
      rows.map(({ category, wipLimit, isCommitmentPoint }) => ({
        category,
        wipLimit,
        isCommitmentPoint,
      }));
    expect(shape(spanish)).toEqual(shape(english));
  });

  it("the generic flow too, when no template is asked for", async () => {
    const spanish = await stagesOf(await newList(inSpanish(world.owner), null));
    expect(spanish.map((s) => s.name)).toEqual([
      "Por hacer",
      "En curso",
      "Hecho",
      "Descartado",
    ]);
    const english = await stagesOf(await newList(world.owner, null));
    expect(english.map((s) => s.name)).toEqual([
      "To do",
      "In progress",
      "Done",
      "Discarded",
    ]);
  });

  it("a template the workspace saved is what people typed: never translated", async () => {
    const stages = SYSTEM_TEMPLATES.generic!.stages.map((s, i) => ({
      ...s,
      name: i === 0 ? "My own first stage" : s.name,
    }));
    const template = await db.workflowTemplate.create({
      data: { workspaceId, name: "Mine", stages },
    });
    const made = await stagesOf(
      await newList(inSpanish(world.owner), template.id),
    );
    expect(made.map((s) => s.name)).toEqual(stages.map((s) => s.name));
  });

  it("the pickers list the system templates in the language asked, with the same references", async () => {
    const english = await listTemplates(world.owner.id, workspaceId);
    const spanish = await listTemplates(world.owner.id, workspaceId, "es");
    expect(spanish.system.map((t) => t.ref)).toEqual(
      english.system.map((t) => t.ref),
    );
    expect(english.system.find((t) => t.ref === "system:support")!.name).toBe(
      "Support desk",
    );
    expect(spanish.system.find((t) => t.ref === "system:support")!.name).toBe(
      "Soporte",
    );
    expect(spanish.organisation).toEqual(english.organisation);
  });
});
