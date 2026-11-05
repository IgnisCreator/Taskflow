// Pure model of a list's workflow: the rules every flow must obey so that the metrics stay comparable
// between lists, the system templates, and the default mapping when a flow is replaced. The browser
// editor and the server use the same functions.

import { en, type Catalog } from "@/lib/i18n/en";

export const CATEGORIES = [
  "BACKLOG",
  "ACTIVE",
  "WAITING",
  "DONE",
  "DISCARDED",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_LABEL: Record<Category, string> = {
  BACKLOG: "To do",
  ACTIVE: "Active",
  WAITING: "Waiting",
  DONE: "Done",
  DISCARDED: "Discarded",
};

export const MAX_STAGES = 20;

/** Stages must run to do, then started work (active or waiting), then done, then discarded. */
const RANK: Record<Category, number> = {
  BACKLOG: 0,
  ACTIVE: 1,
  WAITING: 1,
  DONE: 2,
  DISCARDED: 3,
};
const REQUIRED: Category[] = ["BACKLOG", "ACTIVE", "DONE", "DISCARDED"];
/** Where work in progress is limited: not on finished or discarded work. */
const CAN_LIMIT: Category[] = ["BACKLOG", "ACTIVE", "WAITING"];

export type FlowStage = {
  name: string;
  category: Category;
  wipLimit: number | null;
  policy: string | null;
  /** Where the clock of the cycle time starts: the moment a task is committed to. One per flow. */
  isCommitmentPoint: boolean;
};

/** What is wrong with a flow, as data: the screens write it in the reader's language. */
export type FlowProblem =
  | { code: "TOO_MANY" }
  | { code: "NAME_REQUIRED" }
  | { code: "DUPLICATE"; name: string }
  | { code: "LIMIT_NOT_ALLOWED"; name: string; category: Category }
  | { code: "MISSING"; category: Category }
  | {
      code: "ORDER";
      name: string;
      category: Category;
      previous: string;
      previousCategory: Category;
    }
  | { code: "COMMITMENT_COUNT" }
  | { code: "COMMITMENT_CATEGORY" };

/** The first problem with a flow, or null when it is valid. */
export function flowProblem(stages: FlowStage[]): FlowProblem | null {
  if (stages.length > MAX_STAGES) return { code: "TOO_MANY" };
  const names = new Set<string>();
  for (const stage of stages) {
    const key = stage.name.trim().toLowerCase();
    if (!key) return { code: "NAME_REQUIRED" };
    if (names.has(key)) return { code: "DUPLICATE", name: stage.name.trim() };
    names.add(key);
    if (stage.wipLimit !== null && !CAN_LIMIT.includes(stage.category)) {
      return {
        code: "LIMIT_NOT_ALLOWED",
        name: stage.name.trim(),
        category: stage.category,
      };
    }
  }
  for (const category of REQUIRED) {
    if (!stages.some((s) => s.category === category)) {
      return { code: "MISSING", category };
    }
  }
  for (let i = 1; i < stages.length; i++) {
    if (RANK[stages[i]!.category] < RANK[stages[i - 1]!.category]) {
      return {
        code: "ORDER",
        name: stages[i]!.name.trim(),
        category: stages[i]!.category,
        previous: stages[i - 1]!.name.trim(),
        previousCategory: stages[i - 1]!.category,
      };
    }
  }
  const points = stages.filter((s) => s.isCommitmentPoint);
  if (points.length !== 1) return { code: "COMMITMENT_COUNT" };
  if (points[0]!.category !== "ACTIVE") return { code: "COMMITMENT_CATEGORY" };
  return null;
}

/** The problem as a sentence in the language of `t` (the API uses English). */
export function describeFlowProblem(problem: FlowProblem, t: Catalog): string {
  const p = t.flow.problems;
  const label = (category: Category) => t.categories[category].toLowerCase();
  switch (problem.code) {
    case "TOO_MANY":
      return p.tooMany(MAX_STAGES);
    case "NAME_REQUIRED":
      return p.nameRequired;
    case "DUPLICATE":
      return p.duplicate(problem.name);
    case "LIMIT_NOT_ALLOWED":
      return p.limitNotAllowed(problem.name, label(problem.category));
    case "MISSING":
      return p.missing(label(problem.category));
    case "ORDER":
      return p.order(
        problem.name,
        label(problem.category),
        problem.previous,
        label(problem.previousCategory),
      );
    case "COMMITMENT_COUNT":
      return p.commitmentCount;
    case "COMMITMENT_CATEGORY":
      return p.commitmentCategory;
  }
}

/** The first problem with a flow in English, or null when it is valid. */
export function validateFlow(stages: FlowStage[]): string | null {
  const problem = flowProblem(stages);
  return problem && describeFlowProblem(problem, en);
}

/**
 * Where the tasks of a removed stage go by default when a flow is replaced: the first stage of the
 * same category in the new flow (the first active one for a waiting stage, as work is still going).
 * Returns the index in `next`, or null when nothing fits (cannot happen for a valid flow).
 */
export function defaultTarget(
  removed: { category: Category },
  next: { category: Category }[],
): number | null {
  const wanted: Category[] =
    removed.category === "WAITING" ? ["WAITING", "ACTIVE"] : [removed.category];
  for (const category of wanted) {
    const index = next.findIndex((s) => s.category === category);
    if (index !== -1) return index;
  }
  return null;
}

type Template = { name: string; description: string; stages: FlowStage[] };

const stage = (
  name: string,
  category: Category,
  extra: Partial<
    Pick<FlowStage, "wipLimit" | "policy" | "isCommitmentPoint">
  > = {},
): FlowStage => ({
  name,
  category,
  wipLimit: null,
  policy: null,
  isCommitmentPoint: false,
  ...extra,
});

/** Ready-made flows. Keys are "system:<key>"; organisations add their own, saved from a list. */
export const SYSTEM_TEMPLATES: Record<string, Template> = {
  generic: {
    name: "Generic",
    description: "The basics: to do, in progress, done.",
    stages: [
      stage("To do", "BACKLOG"),
      stage("In progress", "ACTIVE", { isCommitmentPoint: true }),
      stage("Done", "DONE"),
      stage("Discarded", "DISCARDED"),
    ],
  },
  software: {
    name: "Software development",
    description: "From backlog to done with review and testing.",
    stages: [
      stage("Backlog", "BACKLOG"),
      stage("Ready", "BACKLOG", {
        policy: "Clear description and acceptance criteria.",
      }),
      stage("In progress", "ACTIVE", { isCommitmentPoint: true, wipLimit: 3 }),
      stage("Code review", "ACTIVE", {
        wipLimit: 2,
        policy: "At least one approval before merging.",
      }),
      stage("Testing", "ACTIVE"),
      stage("Done", "DONE", { policy: "Merged and deployed." }),
      stage("Discarded", "DISCARDED"),
    ],
  },
  support: {
    name: "Support desk",
    description: "Requests from first contact to resolution.",
    stages: [
      stage("New", "BACKLOG"),
      stage("Triage", "BACKLOG", {
        policy: "Priority and owner assigned.",
      }),
      stage("In progress", "ACTIVE", { isCommitmentPoint: true, wipLimit: 5 }),
      stage("Waiting for customer", "WAITING", {
        policy: "We asked the customer something and wait for the answer.",
      }),
      stage("Resolved", "DONE"),
      stage("Discarded", "DISCARDED"),
    ],
  },
  hiring: {
    name: "Hiring",
    description: "Candidates from application to hire.",
    stages: [
      stage("Applied", "BACKLOG"),
      stage("Screening", "ACTIVE", { isCommitmentPoint: true }),
      stage("Interview", "ACTIVE", { wipLimit: 8 }),
      stage("Offer", "ACTIVE"),
      stage("Hired", "DONE"),
      stage("Withdrawn or rejected", "DISCARDED"),
    ],
  },
  marketing: {
    name: "Content marketing",
    description: "Ideas to published pieces.",
    stages: [
      stage("Ideas", "BACKLOG"),
      stage("Planned", "BACKLOG"),
      stage("Writing", "ACTIVE", { isCommitmentPoint: true, wipLimit: 4 }),
      stage("Review", "ACTIVE"),
      stage("Scheduled", "WAITING", {
        policy: "Approved, waiting for its date.",
      }),
      stage("Published", "DONE"),
      stage("Dropped", "DISCARDED"),
    ],
  },
};

export const DEFAULT_TEMPLATE = "system:generic";

export type MoveEventType = "MOVED" | "DISCARDED" | "REOPENED";

/**
 * The kind of history event for a task that changes stage: reaching a discarded stage is
 * DISCARDED, leaving done or discarded for work that is not closed is REOPENED, anything else is
 * a plain MOVED (including done to discarded and discarded to done).
 */
export function moveEventType(from: Category, to: Category): MoveEventType {
  if (to === "DISCARDED") return "DISCARDED";
  const closed = (c: Category) => c === "DONE" || c === "DISCARDED";
  return closed(from) && !closed(to) ? "REOPENED" : "MOVED";
}

/** A system template by its "system:<key>" reference, or undefined. */
export function systemTemplate(ref: string): Template | undefined {
  return ref.startsWith("system:")
    ? SYSTEM_TEMPLATES[ref.slice("system:".length)]
    : undefined;
}
