import { describe, expect, it } from "vitest";
import {
  createTaskSchema,
  updateTaskSchema,
} from "../../src/lib/validations/tasks";

const base = {
  id: "7f1c2a4e-5b6d-4e8f-9a0b-1c2d3e4f5a6b",
  columnId: "col",
  title: "Task",
  expectedBoardVersion: 0,
};

describe("createTaskSchema", () => {
  it("fills defaults and normalises text", () => {
    const parsed = createTaskSchema.parse({
      ...base,
      title: "  Hi  ",
      description: "  ",
    });
    expect(parsed).toMatchObject({
      title: "Hi",
      description: null,
      priority: "MEDIUM",
      assigneeId: null,
      dueDate: null,
    });
  });

  it("rejects a negative or fractional version", () => {
    expect(() =>
      createTaskSchema.parse({ ...base, expectedBoardVersion: -1 }),
    ).toThrow();
    expect(() =>
      createTaskSchema.parse({ ...base, expectedBoardVersion: 1.5 }),
    ).toThrow();
  });
});

describe("updateTaskSchema", () => {
  it("needs at least one field besides the version", () => {
    expect(() => updateTaskSchema.parse({ expectedBoardVersion: 0 })).toThrow();
    expect(
      updateTaskSchema.parse({ expectedBoardVersion: 0, assigneeId: null })
        .assigneeId,
    ).toBeNull();
  });
});
