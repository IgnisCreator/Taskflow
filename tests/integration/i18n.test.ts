import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cleanupTestData, callAs, type Actor } from "../helpers/actors";
import { createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const { createWorkspace } = await import("@/server/services/workspaces");
const { listTemplates } = await import("@/server/services/templates");
const { SYSTEM_TEMPLATES } = await import("@/lib/workflow");
const listsRoute = await import("@/app/api/lists/route");
const workspacesRoute = await import("@/app/api/workspaces/route");
const demo = await import("@/server/services/demo");
const { notificationText } = await import("@/lib/alerts");
const { listNotifications } = await import("@/server/services/notifications");

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

describe("a new workspace starts with its types in the language it is made in", () => {
  const make = async (actor: Actor, name: string) => {
    const res = await callAs(
      actor,
      workspacesRoute.POST,
      new Request(`${BASE}/api/workspaces`, {
        method: "POST",
        headers: { origin: BASE, "content-type": "application/json" },
        body: JSON.stringify({ name }),
      }),
    );
    expect(res.status).toBe(201);
    const { id } = await res.json();
    return (
      await db.workItemType.findMany({
        where: { workspaceId: id },
        orderBy: { name: "asc" },
        select: { name: true },
      })
    ).map((t) => t.name);
  };

  it("English by default, Spanish with the cookie", async () => {
    expect(await make(world.owner, "In English")).toEqual([
      "Bug",
      "Feature",
      "Request",
      "Task",
    ]);
    expect(await make(inSpanish(world.owner), "En español")).toEqual([
      "Error",
      "Funcionalidad",
      "Petición",
      "Tarea",
    ]);
  });
});

describe("the demo sandbox in Spanish", () => {
  const NOW = Date.now();
  let english: Awaited<ReturnType<typeof demo.createSandbox>>;
  let spanish: Awaited<ReturnType<typeof demo.createSandbox>>;

  beforeAll(async () => {
    english = await demo.createSandbox(NOW, "en");
    spanish = await demo.createSandbox(NOW, "es");
  }, 120_000);
  afterAll(async () => {
    await demo.leaveSandbox(english.userId);
    await demo.leaveSandbox(spanish.userId);
  });

  it("is the same workspace with the words in Spanish: same numbers, same stages in the same places", async () => {
    expect({ tasks: spanish.tasks, events: spanish.events }).toEqual({
      tasks: english.tasks,
      events: english.events,
    });
    const read = (workspaceId: string) =>
      db.workspace.findUniqueOrThrow({
        where: { id: workspaceId },
        select: {
          name: true,
          types: { select: { name: true }, orderBy: { name: "asc" } },
          labels: { select: { name: true }, orderBy: { name: "asc" } },
          spaces: {
            orderBy: { createdAt: "asc" },
            select: {
              name: true,
              lists: {
                select: {
                  name: true,
                  columns: {
                    orderBy: { position: "asc" },
                    select: {
                      name: true,
                      category: true,
                      wipLimit: true,
                      isCommitmentPoint: true,
                      _count: { select: { tasks: true } },
                    },
                  },
                },
              },
            },
          },
        },
      });
    const en = await read(english.workspaceId);
    const es = await read(spanish.workspaceId);
    expect(es.name).toBe("Equipo de Producto de Acme");
    expect(es.spaces.map((s) => s.name).sort()).toEqual([
      "Software",
      "Soporte",
    ]);
    expect(es.types.map((t) => t.name)).toEqual([
      "Error",
      "Funcionalidad",
      "Petición",
      "Tarea",
    ]);
    expect(es.labels.map((l) => l.name)).toEqual(
      ["backend", "cliente", "frontend", "urgente"].sort(),
    );
    const lists = (w: typeof es) => w.spaces.flatMap((s) => s.lists);
    expect(
      lists(es)
        .map((l) => l.name)
        .sort(),
    ).toEqual(["Peticiones de clientes", "Plataforma"]);
    // The same flow shape (categories, limits, commitment point) and the same tasks in each stage.
    const shape = (w: typeof es) =>
      lists(w)
        .sort((a, b) => a.columns.length - b.columns.length)
        .map((l) =>
          l.columns.map((c) => [
            c.category,
            c.wipLimit,
            c.isCommitmentPoint,
            c._count.tasks,
          ]),
        );
    expect(shape(es)).toEqual(shape(en));
    const platform = lists(es).find((l) => l.name === "Plataforma")!;
    expect(
      platform.columns.find((c) => c.name === "Revisión de código")!.wipLimit,
    ).toBe(3);
  });

  it("its alerts are stored as data and read in the language of the reader", async () => {
    const rows = await db.notification.findMany({
      where: { userId: spanish.userId },
      select: { kind: true, message: true, params: true },
    });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.params !== null)).toBe(true);
    // The stored sentence is English; the data is what the reader's language is made from.
    expect(
      rows.some((r) => r.message.includes("has been over its WIP limit")),
    ).toBe(true);
    const mine = (await listNotifications(spanish.userId)).open;
    const wip = mine.find((n) => n.kind === "WIP_OVER_LIMIT")!;
    expect(notificationText(wip, "es")).toContain("Revisión de código");
    expect(notificationText(wip, "es")).toContain("límite de WIP");
    expect(notificationText(wip, "en")).toContain("over its WIP limit");
  });
});
