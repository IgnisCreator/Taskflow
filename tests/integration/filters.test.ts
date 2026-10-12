import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UNASSIGNED, parseFilter } from "@/lib/validations/filters";
import { cleanupTestData } from "../helpers/actors";
import { createListFor, createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const { getBoard } = await import("@/server/services/tasks");

let world: World;
let listId: string;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
  ({ listId } = await createListFor(world)); // "Assigned to member", MEDIUM, in column 0
  const [first, second] = await db.boardColumn.findMany({
    where: { listId },
    orderBy: { position: "asc" },
  });
  const base = { listId, createdById: world.owner.id };
  for (const data of [
    {
      ...base,
      columnId: first!.id,
      position: 1,
      title: "Fix Login bug",
      priority: "HIGH" as const,
    },
    {
      ...base,
      columnId: first!.id,
      position: 2,
      title: "Write docs",
      description: "explain the LOGIN flow",
      assignees: { create: { userId: world.owner.id } },
    },
    {
      ...base,
      columnId: second!.id,
      position: 0,
      title: "100% done_",
      priority: "LOW" as const,
    },
  ]) {
    await db.task.create({ data });
  }
});
afterAll(cleanupTestData);

/** Titles that pass the filter, column by column. */
const titles = async (filter: Parameters<typeof getBoard>[2]) =>
  (await getBoard(world.owner.id, listId, filter)).columns.map((c) =>
    c.tasks.map((t) => t.title),
  );

describe("board filters (applied in SQL)", () => {
  it("returns everything without a filter", async () => {
    expect((await titles({})).flat()).toHaveLength(4);
  });

  it("search matches title or description, ignoring case", async () => {
    const [first] = await titles({ q: "login" });
    expect(first).toEqual(["Fix Login bug", "Write docs"]);
  });

  it("search treats % and _ as plain characters", async () => {
    expect((await titles({ q: "100%" })).flat()).toEqual(["100% done_"]);
    expect((await titles({ q: "_" })).flat()).toEqual(["100% done_"]);
    expect((await titles({ q: "%" })).flat()).toEqual(["100% done_"]);
  });

  it("filters by priority, by assignee and by no assignee", async () => {
    expect((await titles({ priority: "HIGH" })).flat()).toEqual([
      "Fix Login bug",
    ]);
    expect((await titles({ assignee: world.owner.id })).flat()).toEqual([
      "Write docs",
    ]);
    expect((await titles({ assignee: UNASSIGNED })).flat()).toEqual([
      "Fix Login bug",
      "100% done_",
    ]);
  });

  it("combines filters with AND and keeps the order", async () => {
    expect((await titles({ q: "login", priority: "HIGH" })).flat()).toEqual([
      "Fix Login bug",
    ]);
    expect((await titles({ q: "login", priority: "LOW" })).flat()).toEqual([]);
  });

  it("each column reports its total regardless of the filter", async () => {
    const { columns } = await getBoard(world.owner.id, listId, {
      priority: "LOW" as const,
    });
    expect(columns.map((c) => [c.tasks.length, c.total]).slice(0, 2)).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });
});

describe("type, label and blocked filters", () => {
  let typeId = "";
  let labelId = "";
  beforeAll(async () => {
    const { workspaceId, listId: id } = await createListFor(world);
    const type = await db.workItemType.findFirstOrThrow({
      where: { workspaceId, name: "Bug" },
    });
    const label = await db.label.create({
      data: { workspaceId, name: "later" },
    });
    typeId = type.id;
    labelId = label.id;
    const first = await db.boardColumn.findFirstOrThrow({
      where: { listId: id, position: 0 },
    });
    const make = (title: string, extra: object) =>
      db.task.create({
        data: {
          listId: id,
          columnId: first.id,
          title,
          position: 10 + title.length,
          createdById: world.owner.id,
          ...extra,
        },
      });
    await make("B", { typeId, blockedReason: "Waiting" });
    await make("BB", { typeId, labels: { create: { labelId } } });
    await make("BBB", {
      labels: { create: { labelId } },
      blockedReason: "Stuck",
    });
    await make("BBBB", {});
    listOfThese = id;
  });
  let listOfThese = "";

  const found = async (filter: Parameters<typeof getBoard>[2]) =>
    (await getBoard(world.owner.id, listOfThese, filter)).columns
      .flatMap((c) => c.tasks.map((t) => t.title))
      .filter((t) => /^B+$/.test(t))
      .sort();

  it("filters by type, and 'none' finds the tasks without one", async () => {
    expect(await found({ type: typeId })).toEqual(["B", "BB"]);
    expect(await found({ type: "none" })).toEqual(["BBB", "BBBB"]);
  });

  it("filters by label", async () => {
    expect(await found({ label: labelId })).toEqual(["BB", "BBB"]);
  });

  it("filters blocked and not blocked", async () => {
    expect(await found({ blocked: "yes" })).toEqual(["B", "BBB"]);
    expect(await found({ blocked: "no" })).toEqual(["BB", "BBBB"]);
  });

  it("combines them with each other", async () => {
    expect(await found({ type: typeId, blocked: "yes" })).toEqual(["B"]);
    expect(await found({ label: labelId, blocked: "no" })).toEqual(["BB"]);
    expect(await found({ type: "none", label: labelId })).toEqual(["BBB"]);
  });
});

describe("parseFilter", () => {
  it("keeps valid values and ignores invalid or repeated ones", () => {
    expect(
      parseFilter({ q: " hi ", priority: "HIGH", assignee: "u1" }),
    ).toEqual({
      q: "hi",
      priority: "HIGH" as const,
      assignee: "u1",
    });
    expect(
      parseFilter({ q: "", priority: "URGENT", assignee: ["a", "b"] }),
    ).toEqual({
      q: undefined,
      priority: undefined,
      assignee: undefined,
    });
    expect(parseFilter({ q: "x".repeat(101) }).q).toBeUndefined();
  });
});
