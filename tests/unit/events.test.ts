import { describe, expect, it } from "vitest";
import { describeEvent } from "../../src/lib/events";

const base = {
  actor: "Ana",
  fromStage: { name: "To do" },
  toStage: { name: "Doing" },
};

describe("describeEvent", () => {
  it.each([
    ["CREATED", "Ana created it in Doing"],
    ["MOVED", "Ana moved it from To do to Doing"],
    ["DISCARDED", "Ana discarded it (from To do to Doing)"],
    ["REOPENED", "Ana reopened it (from To do to Doing)"],
    ["BLOCKED", "Ana blocked it in Doing"],
    ["UNBLOCKED", "Ana unblocked it in Doing"],
  ] as const)("%s", (type, text) => {
    expect(describeEvent({ ...base, type })).toBe(text);
  });

  it("names a stage that was deleted later", () => {
    expect(describeEvent({ ...base, type: "MOVED", fromStage: null })).toBe(
      "Ana moved it from a removed stage to Doing",
    );
  });
});
