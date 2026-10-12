import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { callAs, cleanupTestData } from "../helpers/actors";
import {
  createListFor,
  createWorld,
  snapshotList,
  type World,
} from "../helpers/world";

const { db } = await import("@/server/db");
const flowRoute = await import("@/app/api/lists/[listId]/flow/route");
const listsRoute = await import("@/app/api/lists/route");
const { SYSTEM_TEMPLATES } = await import("@/lib/workflow");

const BASE = "http://localhost:3000";
const OK = { origin: BASE, "content-type": "application/json" };

let world: World;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
});
afterAll(cleanupTestData);

type Stage = {
  id?: string;
  name: string;
  category: string;
  wipLimit: number | null;
  policy: string | null;
  isCommitmentPoint: boolean;
};

/** The stages of a list as the editor would send them back, ids included. */
async function stagesOf(listId: string): Promise<Stage[]> {
  const rows = await db.boardColumn.findMany({
    where: { listId },
    orderBy: { position: "asc" },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    category: c.category,
    wipLimit: c.wipLimit,
    policy: c.policy,
    isCommitmentPoint: c.isCommitmentPoint,
  }));
}

const putFlow = (
  listId: string,
  body: object,
  actor: typeof world.owner = world.owner,
) =>
  callAs(
    actor,
    flowRoute.PUT,
    new Request(`${BASE}/api/lists/${listId}/flow`, {
      method: "PUT",
      headers: OK,
      body: JSON.stringify(body),
    }),
    { listId },
  );

const stage = (
  name: string,
  category: string,
  extra: Partial<Stage> = {},
): Stage => ({
  name,
  category,
  wipLimit: null,
  policy: null,
  isCommitmentPoint: false,
  ...extra,
});

/** Names in position order, and positions as stored (they must stay 0..n-1). */
const layout = async (listId: string) => {
  const rows = await db.boardColumn.findMany({
    where: { listId },
    orderBy: { position: "asc" },
  });
  return {
    names: rows.map((r) => r.name),
    positions: rows.map((r) => r.position),
  };
};

describe("changing a flow", () => {
  it("renames a stage, sets its limit and policy, and keeps its id, its tasks and the version rule", async () => {
    const { listId } = await createListFor(world);
    const stages = await stagesOf(listId);
    stages[0] = {
      ...stages[0]!,
      name: "Inbox",
      policy: " Ready to start ",
      wipLimit: 5,
    };

    const res = await putFlow(listId, { expectedBoardVersion: 0, stages });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.boardVersion).toBe(1);
    expect(body.stages[0]).toMatchObject({
      id: stages[0]!.id,
      name: "Inbox",
      policy: "Ready to start",
      wipLimit: 5,
    });
    expect(await db.task.count({ where: { columnId: stages[0]!.id } })).toBe(1);
  });

  it("adds an extra stage between two others and keeps positions 0..n-1", async () => {
    const { listId } = await createListFor(world);
    const stages = await stagesOf(listId);
    stages.splice(3, 0, stage("Approval", "WAITING"));

    const res = await putFlow(listId, { expectedBoardVersion: 0, stages });

    expect(res.status).toBe(200);
    const { names, positions } = await layout(listId);
    expect(names).toEqual([
      "To do",
      "In progress",
      "In review",
      "Approval",
      "Done",
      "Discarded",
    ]);
    expect(positions).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("reorders stages inside their category order", async () => {
    const { listId } = await createListFor(world);
    const stages = await stagesOf(listId);
    [stages[1], stages[2]] = [stages[2]!, stages[1]!]; // "In review" before "In progress"
    stages[1]!.isCommitmentPoint = true; // the commitment point follows "In review"
    stages[2]!.isCommitmentPoint = false;

    const res = await putFlow(listId, { expectedBoardVersion: 0, stages });

    expect(res.status).toBe(200);
    expect((await layout(listId)).names.slice(1, 3)).toEqual([
      "In review",
      "In progress",
    ]);
  });

  it("removes an empty stage", async () => {
    const { listId } = await createListFor(world);
    const stages = (await stagesOf(listId)).filter(
      (s) => s.name !== "In review",
    );

    const res = await putFlow(listId, { expectedBoardVersion: 0, stages });

    expect(res.status).toBe(200);
    expect((await layout(listId)).names).toEqual([
      "To do",
      "In progress",
      "Done",
      "Discarded",
    ]);
  });

  it("will not remove a stage that holds tasks until they have somewhere to go", async () => {
    const { listId } = await createListFor(world);
    // "To do" goes away and a new "Inbox" takes its category, so the flow itself stays valid.
    const stages = (await stagesOf(listId)).filter((s) => s.name !== "To do");
    stages.unshift(stage("Inbox", "BACKLOG"));
    const before = await snapshotList(listId);

    const missing = await putFlow(listId, { expectedBoardVersion: 0, stages });
    expect(missing.status).toBe(400);
    expect((await missing.json()).error.code).toBe("MISSING_TARGET");
    expect(await snapshotList(listId)).toBe(before); // nothing changed, not even the version

    const outOfRange = await putFlow(listId, {
      expectedBoardVersion: 0,
      stages,
      moveTo: { [(await stagesOf(listId))[0]!.id!]: 99 }, // there is no stage 99
    });
    expect(outOfRange.status).toBe(400);
    expect(await snapshotList(listId)).toBe(before);
  });

  it("moves the tasks of a removed stage to the end of the chosen one, in order", async () => {
    const { listId, taskId } = await createListFor(world);
    const [todo, doing] = await stagesOf(listId);
    const col = (id: string) =>
      db.task.findMany({
        where: { columnId: id },
        orderBy: { position: "asc" },
      });
    // "In progress" already holds one task; "To do" holds the fixture task.
    const extra = await db.task.create({
      data: {
        listId,
        columnId: doing!.id!,
        title: "Already there",
        position: 0,
        createdById: world.owner.id,
      },
    });
    const stages = (await stagesOf(listId)).filter((s) => s.id !== todo!.id);
    stages[0]!.isCommitmentPoint = true;
    // "To do" was the only to do stage: add another one first in the same request.
    stages.unshift(stage("Inbox", "BACKLOG"));

    const res = await putFlow(listId, {
      expectedBoardVersion: 0,
      stages,
      moveTo: { [todo!.id!]: 1 }, // index 1 = "In progress" (Inbox is 0)
    });

    expect(res.status).toBe(200);
    const inProgress = await col(doing!.id!);
    expect(inProgress.map((t) => [t.id, t.position])).toEqual([
      [extra.id, 0],
      [taskId, 1],
    ]);
    expect(await db.boardColumn.count({ where: { id: todo!.id } })).toBe(0);
  });

  it("replaces the whole flow with a template, sending each old stage's tasks to a new one", async () => {
    const { listId, taskId } = await createListFor(world);
    const old = await stagesOf(listId);
    const template = SYSTEM_TEMPLATES.support!.stages.map((s) => ({ ...s }));
    const moveTo = Object.fromEntries(
      old.map((s) => [
        s.id!,
        template.findIndex(
          (t) =>
            t.category === (s.category === "WAITING" ? "ACTIVE" : s.category),
        ),
      ]),
    );

    const res = await putFlow(listId, {
      expectedBoardVersion: 0,
      stages: template,
      moveTo,
    });

    expect(res.status).toBe(200);
    expect((await layout(listId)).names).toEqual(template.map((t) => t.name));
    const task = await db.task.findUniqueOrThrow({
      where: { id: taskId },
      include: { column: true },
    });
    expect(task.column.name).toBe("New"); // the old to do stage maps to the first to do stage
    expect(task.position).toBe(0);
    expect(
      await db.boardColumn.count({
        where: { id: { in: old.map((s) => s.id!) } },
      }),
    ).toBe(0);
  });
});

describe("a flow that is refused changes nothing", () => {
  const cases: [string, (s: Stage[]) => Stage[], string][] = [
    [
      "a missing discarded stage",
      (s) => s.filter((x) => x.category !== "DISCARDED"),
      "INVALID_FLOW",
    ],
    [
      "a done stage before an active one",
      (s) => [s[0]!, s[3]!, s[1]!, s[2]!, s[4]!],
      "INVALID_FLOW",
    ],
    [
      "a duplicate name",
      (s) => s.map((x, i) => (i === 2 ? { ...x, name: "to do" } : x)),
      "INVALID_FLOW",
    ],
    [
      "no commitment point",
      (s) => s.map((x) => ({ ...x, isCommitmentPoint: false })),
      "INVALID_FLOW",
    ],
    [
      "a WIP limit on a done stage",
      (s) => s.map((x) => (x.category === "DONE" ? { ...x, wipLimit: 3 } : x)),
      "INVALID_FLOW",
    ],
    [
      "a stage of another list",
      (s) => s.map((x, i) => (i === 0 ? { ...x, id: crypto.randomUUID() } : x)),
      "INVALID_STAGE",
    ],
    [
      "the same stage twice",
      (s) => [
        s[0]!,
        s[1]!,
        { ...s[1]!, name: "Clone", isCommitmentPoint: false },
        ...s.slice(2),
      ],
      "INVALID_STAGE",
    ],
  ];

  it.each(cases)("%s", async (_name, change, code) => {
    const { listId } = await createListFor(world);
    const before = await snapshotList(listId);

    const res = await putFlow(listId, {
      expectedBoardVersion: 0,
      stages: change(await stagesOf(listId)),
    });

    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe(code);
    expect(await snapshotList(listId)).toBe(before);
  });

  it.each([
    ["a WIP limit of 0", { wipLimit: 0 }],
    ["a name over 40 characters", { name: "x".repeat(41) }],
    ["a policy over 300 characters", { policy: "x".repeat(301) }],
    ["an unknown field", { position: 3 }],
  ])("rejects %s with 400", async (_name, patch) => {
    const { listId } = await createListFor(world);
    const stages = await stagesOf(listId);
    stages[1] = { ...stages[1]!, ...patch };
    const res = await putFlow(listId, { expectedBoardVersion: 0, stages });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("VALIDATION_ERROR");
  });

  it("answers a stale version with 409", async () => {
    const { listId } = await createListFor(world);
    const before = await snapshotList(listId);
    const res = await putFlow(listId, {
      expectedBoardVersion: 4,
      stages: await stagesOf(listId),
    });
    expect(res.status).toBe(409);
    expect((await res.json()).error.currentVersion).toBe(0);
    expect(await snapshotList(listId)).toBe(before);
  });
});

describe("lists get their stages from a template", () => {
  const create = (body: object) =>
    callAs(
      world.owner,
      listsRoute.POST,
      new Request(`${BASE}/api/lists`, {
        method: "POST",
        headers: OK,
        body: JSON.stringify(body),
      }),
    );

  it("copies the stages of the system template that was asked for", async () => {
    const { spaceId } = await createListFor(world);
    const res = await create({
      spaceId,
      name: "Dev",
      templateId: "system:software",
    });
    expect(res.status).toBe(201);
    const { id } = await res.json();
    expect((await layout(id)).names).toEqual(
      SYSTEM_TEMPLATES.software!.stages.map((s) => s.name),
    );
    const rows = await stagesOf(id);
    expect(rows.find((r) => r.name === "In progress")).toMatchObject({
      category: "ACTIVE",
      wipLimit: 3,
      isCommitmentPoint: true,
    });
  });

  it("rejects an unknown template", async () => {
    const { spaceId } = await createListFor(world);
    const res = await create({ spaceId, name: "X", templateId: "system:nope" });
    expect(res.status).toBe(400);
    expect((await res.json()).error.code).toBe("INVALID_TEMPLATE");
  });
});
