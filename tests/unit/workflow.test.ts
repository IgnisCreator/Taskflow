import { describe, expect, it } from "vitest";
import {
  SYSTEM_TEMPLATES,
  defaultTarget,
  moveEventType,
  systemTemplate,
  validateFlow,
  type Category,
  type FlowStage,
} from "../../src/lib/workflow";

const s = (
  name: string,
  category: Category,
  extra: Partial<FlowStage> = {},
): FlowStage => ({
  name,
  category,
  wipLimit: null,
  policy: null,
  isCommitmentPoint: false,
  ...extra,
});
const valid = (): FlowStage[] => [
  s("To do", "BACKLOG"),
  s("In progress", "ACTIVE", { isCommitmentPoint: true }),
  s("Done", "DONE"),
  s("Discarded", "DISCARDED"),
];

describe("system templates", () => {
  it.each(Object.entries(SYSTEM_TEMPLATES))("%s is a valid flow", (_key, t) => {
    expect(validateFlow(t.stages)).toBeNull();
  });

  it("are found by their system: reference", () => {
    expect(systemTemplate("system:software")?.name).toBe(
      "Software development",
    );
    expect(systemTemplate("system:nope")).toBeUndefined();
    expect(systemTemplate("0b1e")).toBeUndefined();
  });
});

describe("validateFlow", () => {
  it("accepts extra stages in the right place", () => {
    const flow = valid();
    flow.splice(2, 0, s("Review", "ACTIVE"), s("Parked", "WAITING"));
    expect(validateFlow(flow)).toBeNull();
  });

  it.each([
    ["no discarded stage", (f: FlowStage[]) => f.slice(0, 3)],
    [
      "no done stage",
      (f: FlowStage[]) => f.filter((x) => x.category !== "DONE"),
    ],
    ["no to do stage", (f: FlowStage[]) => f.slice(1)],
    [
      "no active stage",
      (f: FlowStage[]) => f.filter((x) => x.category !== "ACTIVE"),
    ],
    [
      "an active stage after done",
      (f: FlowStage[]) => [...f.slice(0, 3), s("Late", "ACTIVE"), f[3]!],
    ],
    [
      "to do after active",
      (f: FlowStage[]) => [f[0]!, f[1]!, s("Back", "BACKLOG"), f[2]!, f[3]!],
    ],
    [
      "a duplicate name, ignoring case",
      (f: FlowStage[]) => [
        ...f.slice(0, 2),
        s(" done ", "ACTIVE"),
        ...f.slice(2),
      ],
    ],
    ["an empty name", (f: FlowStage[]) => [s("  ", "BACKLOG"), ...f.slice(1)]],
    [
      "no commitment point",
      (f: FlowStage[]) => f.map((x) => ({ ...x, isCommitmentPoint: false })),
    ],
    [
      "two commitment points",
      (f: FlowStage[]) => [
        s("Also", "ACTIVE", { isCommitmentPoint: true }),
        ...f,
      ],
    ],
    [
      "a commitment point on a to do stage",
      (f: FlowStage[]) =>
        f.map((x) => ({ ...x, isCommitmentPoint: x.category === "BACKLOG" })),
    ],
    [
      "a WIP limit on a done stage",
      (f: FlowStage[]) =>
        f.map((x) => (x.category === "DONE" ? { ...x, wipLimit: 2 } : x)),
    ],
    [
      "more than 20 stages",
      (f: FlowStage[]) => [
        f[0]!,
        f[1]!,
        ...Array.from({ length: 19 }, (_, i) => s(`Extra ${i}`, "ACTIVE")),
        f[2]!,
        f[3]!,
      ],
    ],
  ])("rejects %s", (_name, mutate) => {
    expect(validateFlow(mutate(valid()))).toEqual(expect.any(String));
  });

  it("allows a WIP limit on to do, active and waiting stages", () => {
    const flow = valid();
    flow.splice(2, 0, s("Parked", "WAITING", { wipLimit: 2 }));
    flow[0] = { ...flow[0]!, wipLimit: 10 };
    flow[1] = { ...flow[1]!, wipLimit: 3 };
    expect(validateFlow(flow)).toBeNull();
  });
});

describe("defaultTarget", () => {
  const next = valid();
  it("maps each category to the first stage of the same category", () => {
    expect(defaultTarget({ category: "BACKLOG" }, next)).toBe(0);
    expect(defaultTarget({ category: "ACTIVE" }, next)).toBe(1);
    expect(defaultTarget({ category: "DONE" }, next)).toBe(2);
    expect(defaultTarget({ category: "DISCARDED" }, next)).toBe(3);
  });

  it("sends waiting work to the first active stage when there is no waiting stage", () => {
    expect(defaultTarget({ category: "WAITING" }, next)).toBe(1);
    const withWaiting = [
      ...next.slice(0, 2),
      s("Parked", "WAITING"),
      ...next.slice(2),
    ];
    expect(defaultTarget({ category: "WAITING" }, withWaiting)).toBe(2);
  });
});

describe("moveEventType", () => {
  it.each([
    ["BACKLOG", "ACTIVE", "MOVED"],
    ["ACTIVE", "WAITING", "MOVED"],
    ["ACTIVE", "DONE", "MOVED"],
    ["ACTIVE", "DISCARDED", "DISCARDED"],
    ["BACKLOG", "DISCARDED", "DISCARDED"],
    ["DONE", "DISCARDED", "DISCARDED"],
    ["DONE", "ACTIVE", "REOPENED"],
    ["DONE", "BACKLOG", "REOPENED"],
    ["DISCARDED", "BACKLOG", "REOPENED"],
    ["DISCARDED", "DONE", "MOVED"],
    ["ACTIVE", "BACKLOG", "MOVED"],
  ] as const)("%s to %s is %s", (from, to, expected) => {
    expect(moveEventType(from, to)).toBe(expected);
  });
});
