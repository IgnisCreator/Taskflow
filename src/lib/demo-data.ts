// The sample data of the public demo, made by a small simulation instead of a hand-written list: tasks
// arrive, wait, are worked on and finished over six months, so every chart, alert and forecast has
// something true to show. Pure and seeded: the same `today` and seed always give the same history.
//
// The story it tells: the "Platform" list has a healthy flow until the last six weeks, when code review
// falls to one reviewer and the stage becomes a bottleneck (queue and WIP limit exceeded, old tasks);
// "Customer requests" is steady. Some tasks are blocked for a few days, some are reopened after being
// done, some are discarded. Everything happens on weekdays and ends yesterday.

import { mulberry32 } from "@/lib/forecast";
import { DAY_MS } from "@/lib/metrics";

export const DEMO_SEED = 20261028;
export const DEMO_DAYS = 180;
/** The 6-week stretch in which review is short of reviewers, in weekdays. */
export const BOTTLENECK_WEEKDAYS = 30;

/** Made-up teammates; the demo visitor is a separate read-only guest. */
export const DEMO_PEOPLE = [
  { name: "Dana Reyes", role: "OWNER" },
  { name: "Marco Silva", role: "ADMIN" },
  { name: "Priya Nair", role: "MEMBER" },
  { name: "Tom Becker", role: "MEMBER" },
  { name: "Lucia Fernandez", role: "MEMBER" },
] as const;
export const DEMO_LABELS = ["frontend", "backend", "customer", "urgent"];

export type DemoEvent = {
  type:
    "CREATED" | "MOVED" | "BLOCKED" | "UNBLOCKED" | "DISCARDED" | "REOPENED";
  /** Milliseconds since the epoch. */
  at: number;
  stage: string;
  fromStage: string | null;
  /** Index into DEMO_PEOPLE. */
  actor: number;
};
export type DemoTask = {
  title: string;
  type: string;
  priority: "LOW" | "MEDIUM" | "HIGH";
  /** Indexes into DEMO_PEOPLE. */
  assignees: number[];
  labels: string[];
  dueDate: string | null;
  blockedReason: string | null;
  /** Where it is now: the stage of its last event. */
  stage: string;
  createdAt: number;
  events: DemoEvent[];
};
export type DemoList = {
  name: string;
  space: string;
  template: "software" | "support";
  /** Limits set on top of the template's, so the story shows in the alerts. */
  wipLimits: Record<string, number>;
  tasks: DemoTask[];
};

type Pick = <T>(items: readonly T[]) => T;

type Step = {
  stage: string;
  /** Weekdays spent here before it may leave. */
  dwell?: [number, number];
  /** Leaves as soon as the next step has room. */
  hold?: boolean;
  /** Work done here by `capacity` people at a time; entering is gated by that capacity. */
  pull?: { capacity: number; days: [number, number]; block: number };
  /** Tasks wait inside the stage for a free server; service takes `days`. */
  inline?: {
    servers: (day: number, total: number) => number;
    days: (day: number, total: number) => [number, number];
  };
  /** Chance that a task skips this stage. */
  skip?: number;
  terminal?: boolean;
};
type Flow = {
  name: string;
  space: string;
  template: DemoList["template"];
  /** Average new tasks per weekday. */
  arrivals: number;
  steps: Step[];
  wipLimits: Record<string, number>;
  types: [string, number][];
  titles: (pick: Pick) => string;
};

const VERBS = [
  "Fix",
  "Add",
  "Refactor",
  "Improve",
  "Document",
  "Migrate",
  "Optimise",
  "Test",
  "Remove",
  "Review",
];
const AREAS = [
  "login redirect",
  "search filters",
  "payment webhook",
  "invoice export",
  "avatar upload",
  "rate limiter",
  "notification settings",
  "dashboard widgets",
  "CSV import",
  "audit log",
  "password reset",
  "session timeout",
  "onboarding checklist",
  "API pagination",
  "email templates",
  "dark theme colours",
  "cache invalidation",
  "report scheduler",
];
const ISSUES = [
  "Cannot log in",
  "Invoice shows the wrong total",
  "Export fails with a timeout",
  "Request: bulk edit",
  "Question about permissions",
  "Email notifications are late",
  "Cannot reset the password",
  "Data missing after import",
  "Question about webhooks",
  "Billing address change",
  "Dashboard is slow",
  "Account deletion request",
];
const COMPANIES = [
  "Acme",
  "Globex",
  "Initech",
  "Umbrella",
  "Hooli",
  "Stark",
  "Wayne",
];
const BLOCKS = [
  "Waiting for API credentials from the vendor",
  "Needs a decision from product",
  "The test environment is down",
  "Waiting for the design review",
];

const FLOWS: Flow[] = [
  {
    name: "Platform",
    space: "Software",
    template: "software",
    arrivals: 0.8,
    wipLimits: { "In progress": 5, "Code review": 3 },
    types: [
      ["Feature", 40],
      ["Bug", 30],
      ["Task", 25],
      ["Request", 5],
    ],
    titles: (pick) => `${pick(VERBS)} ${pick(AREAS)}`,
    steps: [
      { stage: "Backlog", dwell: [1, 3] },
      { stage: "Ready", hold: true },
      { stage: "In progress", pull: { capacity: 4, days: [2, 5], block: 0.1 } },
      {
        stage: "Code review",
        inline: {
          // Two reviewers that take a day, until the last six weeks: one reviewer, two or three days.
          servers: (day, total) => (day >= total - BOTTLENECK_WEEKDAYS ? 1 : 2),
          days: (day, total) =>
            day >= total - BOTTLENECK_WEEKDAYS ? [2, 3] : [1, 1],
        },
      },
      { stage: "Testing", dwell: [1, 2] },
      { stage: "Done", terminal: true },
    ],
  },
  {
    name: "Customer requests",
    space: "Support",
    template: "support",
    arrivals: 1,
    wipLimits: { "In progress": 5 },
    types: [
      ["Request", 60],
      ["Bug", 25],
      ["Task", 15],
    ],
    titles: (pick) => `${pick(ISSUES)} - ${pick(COMPANIES)}`,
    steps: [
      { stage: "New", dwell: [1, 1] },
      { stage: "Triage", hold: true },
      {
        stage: "In progress",
        pull: { capacity: 3, days: [1, 3], block: 0.05 },
      },
      { stage: "Waiting for customer", dwell: [1, 4], skip: 0.55 },
      { stage: "Resolved", terminal: true },
    ],
  },
];

/** The weekdays (midnight UTC) of the `DEMO_DAYS` days that end yesterday. */
function weekdays(today: number): number[] {
  const days: number[] = [];
  for (let d = today - DEMO_DAYS * DAY_MS; d < today; d += DAY_MS) {
    const weekday = new Date(d).getUTCDay();
    if (weekday !== 0 && weekday !== 6) days.push(d);
  }
  return days;
}

type Item = {
  task: DemoTask;
  step: number;
  enteredAt: number;
  leaveAt: number;
  movedOn: number;
  serving: boolean;
  fate: "normal" | "discard-early" | "discard-work" | "reopen";
};

function simulate(
  flow: Flow,
  days: number[],
  random: () => number,
): DemoTask[] {
  const n = days.length;
  const int = (lo: number, hi: number) =>
    lo + Math.floor(random() * (hi - lo + 1));
  const chance = (p: number) => random() < p;
  const pick: Pick = (items) => items[Math.floor(random() * items.length)]!;
  const steps = flow.steps;
  const done = steps.length - 1;
  const workStep = steps.findIndex((s) => s.pull);
  const items: Item[] = [];
  const later = new Map<number, (() => void)[]>();
  const at = (day: number) =>
    days[day]! + (9 * 60 + Math.floor(random() * 480)) * 60_000;
  const schedule = (day: number, run: () => void) => {
    if (day < n) later.set(day, [...(later.get(day) ?? []), run]);
  };
  const log = (
    item: Item,
    day: number,
    type: DemoEvent["type"],
    stage: string,
    fromStage: string | null,
  ) => {
    const actor =
      item.task.assignees[0] ?? (type === "CREATED" ? int(0, 4) : 1);
    item.task.events.push({ type, at: at(day), stage, fromStage, actor });
  };

  const enter = (item: Item, target: number, day: number, from: string) => {
    const step = steps[target]!;
    item.step = target;
    item.enteredAt = day;
    item.movedOn = day;
    item.serving = false;
    if (step.pull) {
      item.task.assignees = [
        ...new Set(chance(0.2) ? [int(1, 4), int(1, 4)] : [int(1, 4)]),
      ];
    }
    log(item, day, "MOVED", step.stage, from);
    if (step.dwell) item.leaveAt = day + int(...step.dwell);
    else if (step.hold) item.leaveAt = day;
    else if (step.pull) {
      let duration = int(...step.pull.days);
      // A task that will be discarded soon is not also blocked: its history stays in order.
      if (item.fate !== "discard-work" && chance(step.pull.block)) {
        const length = int(1, 3);
        const reason = pick(BLOCKS);
        schedule(day + 1, () => {
          log(item, day + 1, "BLOCKED", step.stage, step.stage);
          item.task.blockedReason = reason;
        });
        schedule(day + 1 + length, () => {
          log(item, day + 1 + length, "UNBLOCKED", step.stage, step.stage);
          item.task.blockedReason = null;
        });
        duration += length + 1;
      }
      item.leaveAt = day + duration;
      if (item.fate === "discard-work") item.leaveAt = day + int(1, 2);
    } else if (step.inline) item.leaveAt = Infinity;
    else if (step.terminal) {
      item.leaveAt = Infinity;
      if (item.fate === "reopen") {
        const back = day + int(2, 6);
        const again = back + int(1, 3);
        const work = steps[workStep]!.stage;
        item.step = -1; // outside the flow while it is being redone
        schedule(back, () => log(item, back, "REOPENED", work, step.stage));
        schedule(again, () => log(item, again, "MOVED", step.stage, work));
      }
    }
  };

  for (let day = 0; day < n; day++) {
    for (const run of later.get(day) ?? []) run();

    for (let s = done - 1; s >= 0; s--) {
      const step = steps[s]!;
      const here = items.filter((it) => it.step === s);
      if (step.inline) {
        const serving = here.filter(
          (it) => it.serving && it.leaveAt > day,
        ).length;
        const free = step.inline.servers(day, n) - serving;
        const waiting = here
          .filter((it) => !it.serving)
          .sort((a, b) => a.enteredAt - b.enteredAt)
          .slice(0, Math.max(0, free));
        for (const it of waiting) {
          it.serving = true;
          it.leaveAt = day + int(...step.inline.days(day, n));
        }
      }
      for (const item of here.sort((a, b) => a.enteredAt - b.enteredAt)) {
        if (item.leaveAt > day || item.movedOn === day) continue;
        const discards =
          (item.fate === "discard-early" && s <= 1) ||
          (item.fate === "discard-work" && step.pull);
        if (discards) {
          log(item, day, "DISCARDED", "Discarded", step.stage);
          item.step = -1;
          continue;
        }
        let target = s + 1;
        while (steps[target]!.skip && chance(steps[target]!.skip!)) target++;
        const next = steps[target]!;
        if (
          next.pull &&
          items.filter((it) => it.step === target).length >= next.pull.capacity
        )
          continue;
        enter(item, target, day, step.stage);
      }
    }

    // Arrivals: a Poisson count with the flow's average.
    let count = 0;
    for (
      let p = random(), limit = Math.exp(-flow.arrivals);
      p > limit;
      p *= random()
    )
      count++;
    for (let k = 0; k < count; k++) {
      const roll = random();
      const task: DemoTask = {
        title: flow.titles(pick),
        type: weighted(flow.types, random()),
        priority: roll < 0.2 ? "HIGH" : roll < 0.75 ? "MEDIUM" : "LOW",
        assignees: [],
        labels: chance(0.5) ? [pick(DEMO_LABELS)] : [],
        dueDate: chance(0.25)
          ? new Date(days[day]! + int(10, 30) * DAY_MS)
              .toISOString()
              .slice(0, 10)
          : null,
        blockedReason: null,
        stage: steps[0]!.stage,
        createdAt: 0,
        events: [],
      };
      const fateRoll = random();
      const item: Item = {
        task,
        step: 0,
        enteredAt: day,
        leaveAt: day + int(...steps[0]!.dwell!),
        movedOn: day,
        serving: false,
        fate:
          fateRoll < 0.06
            ? "discard-early"
            : fateRoll < 0.08
              ? "discard-work"
              : fateRoll < 0.13
                ? "reopen"
                : "normal",
      };
      log(item, day, "CREATED", steps[0]!.stage, null);
      items.push(item);
    }
  }

  return items.map(({ task }) => {
    task.createdAt = task.events[0]!.at;
    task.stage = task.events.at(-1)!.stage;
    return task;
  });
}

function weighted(options: [string, number][], roll: number): string {
  const total = options.reduce((sum, [, weight]) => sum + weight, 0);
  let left = roll * total;
  for (const [name, weight] of options) {
    if ((left -= weight) < 0) return name;
  }
  return options[0]![0];
}

/** The whole demo: the lists with their tasks and histories, ending yesterday (`today` is midnight UTC). */
export function generateDemo(today: number, seed = DEMO_SEED): DemoList[] {
  const random = mulberry32(seed);
  const days = weekdays(today);
  return FLOWS.map((flow) => ({
    name: flow.name,
    space: flow.space,
    template: flow.template,
    wipLimits: flow.wipLimits,
    tasks: simulate(flow, days, random),
  }));
}
