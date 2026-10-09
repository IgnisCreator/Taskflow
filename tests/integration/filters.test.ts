import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { UNASSIGNED, parseFilter } from "@/lib/validations/filters";
import { cleanupTestData } from "../helpers/actors";
import { createProjectFor, createWorld, type World } from "../helpers/world";

const { db } = await import("@/server/db");
const { getBoard } = await import("@/server/services/tasks");

let world: World;
let projectId: string;
beforeAll(async () => {
  await cleanupTestData();
  world = await createWorld();
  ({ projectId } = await createProjectFor(world)); // "Assigned to member", MEDIUM, in column 0
  const [first, second] = await db.boardColumn.findMany({
    where: { projectId },
    orderBy: { position: "asc" },
  });
  const base = { projectId, createdById: world.owner.id };
  await db.task.createMany({
    data: [
      {
        ...base,
        columnId: first!.id,
        position: 1,
        title: "Fix Login bug",
        priority: "HIGH",
      },
      {
        ...base,
        columnId: first!.id,
        position: 2,
        title: "Write docs",
        description: "explain the LOGIN flow",
        assigneeId: world.owner.id,
      },
      {
        ...base,
        columnId: second!.id,
        position: 0,
        title: "100% done_",
        priority: "LOW",
      },
    ],
  });
});
afterAll(cleanupTestData);

/** Titles that pass the filter, column by column. */
const titles = async (filter: Parameters<typeof getBoard>[2]) =>
  (await getBoard(world.owner.id, projectId, filter)).columns.map((c) =>
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
    const { columns } = await getBoard(world.owner.id, projectId, {
      priority: "LOW",
    });
    expect(columns.map((c) => [c.tasks.length, c.total]).slice(0, 2)).toEqual([
      [0, 3],
      [1, 1],
    ]);
  });
});

describe("parseFilter", () => {
  it("keeps valid values and ignores invalid or repeated ones", () => {
    expect(
      parseFilter({ q: " hi ", priority: "HIGH", assignee: "u1" }),
    ).toEqual({
      q: "hi",
      priority: "HIGH",
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
