import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  describeAlert,
  detectAlerts,
  DEFAULT_ALERTS,
  notificationText,
} from "../../src/lib/alerts";
import { generateDemo } from "../../src/lib/demo-data";
import { forecastWarnings } from "../../src/lib/forecast";
import { describeEvent } from "../../src/lib/events";
import { parseForecastQuery } from "../../src/lib/validations/forecast";
import { parseMetricsQuery } from "../../src/lib/validations/metrics";
import { translateQueryError } from "../../src/lib/validations/query-errors";
import { formatDueDate } from "../../src/lib/dates";
import { en } from "../../src/lib/i18n/en";
import { es } from "../../src/lib/i18n/es";
import { localizeTemplate } from "../../src/lib/i18n/templates";
import {
  describeFlowProblem,
  flowProblem,
  SYSTEM_TEMPLATES,
  validateFlow,
  type FlowStage,
} from "../../src/lib/workflow";
import {
  formatDateTime,
  formatNumber,
  pickLang,
  plural,
} from "../../src/lib/i18n";

type Leaf = string | ((...args: never[]) => string);
type Node = Leaf | null | Node[] | { [key: string]: Node };

/** Every text of a catalog with the path that leads to it. */
function walk(node: Node, path = ""): [string, Leaf][] {
  // "no policy": the same in both languages, but it must be null in both.
  if (node === null) return [[path, "∅"]];
  if (typeof node === "string" || typeof node === "function") {
    return [[path, node]];
  }
  const entries: [string, Node][] = Array.isArray(node)
    ? node.map((child, i) => [String(i), child])
    : Object.entries(node);
  return entries.flatMap(([key, child]) =>
    walk(child, path ? `${path}.${key}` : key),
  );
}

// Functions get the same sample arguments in both languages (`asc` is for the one that takes a direction).
const SAMPLE = ["Aa", "asc"];
const render = (leaf: Leaf) =>
  typeof leaf === "function"
    ? (leaf as (...args: string[]) => string)(...SAMPLE.slice(0, leaf.length))
    : leaf;

const english = walk(en as Node);
const spanish = new Map(walk(es as Node));

describe("the catalogs", () => {
  it("have the same texts under the same names", () => {
    expect([...spanish.keys()].sort()).toEqual(english.map(([p]) => p).sort());
  });

  it("have no empty text", () => {
    for (const [path, leaf] of [...english, ...spanish]) {
      expect(render(leaf).trim(), path).not.toBe("");
    }
  });

  it("keep the values that functions are given: whatever English shows, Spanish shows too", () => {
    for (const [path, leaf] of english) {
      if (typeof leaf !== "function") continue;
      const es = render(spanish.get(path)!);
      for (const arg of SAMPLE.slice(0, leaf.length)) {
        if (render(leaf).includes(arg)) expect(es, path).toContain(arg);
      }
    }
  });

  it("are translated: no long text is left identical to the English one", () => {
    for (const [path, leaf] of english) {
      const text = render(leaf);
      if (text.length < 20) continue;
      expect(render(spanish.get(path)!), path).not.toBe(text);
    }
  });
});

describe("choosing the language", () => {
  it("the cookie wins; a cookie we do not have is ignored", () => {
    expect(pickLang("es", "en-US,en;q=0.9")).toBe("es");
    expect(pickLang("fr", "es-ES")).toBe("es");
    expect(pickLang(undefined, null)).toBe("en");
  });

  it("without a cookie the browser's preference decides, highest quality first", () => {
    expect(pickLang(undefined, "es-MX,es;q=0.9,en;q=0.8")).toBe("es");
    expect(pickLang(undefined, "en-GB,en;q=0.9,es;q=0.8")).toBe("en");
    expect(pickLang(undefined, "fr-FR,fr;q=0.9,es;q=0.5")).toBe("es");
    expect(pickLang(undefined, "de,fr")).toBe("en");
    expect(pickLang(undefined, "es;q=0,en;q=0.5")).toBe("en");
  });
});

describe("formatting", () => {
  it("numbers use the language's decimal mark", () => {
    expect(formatNumber(24.66, "en")).toBe("24.7");
    expect(formatNumber(24.66, "es")).toBe("24,7");
    expect(formatNumber(3, "es", 0)).toBe("3");
  });

  it("instants are shown in UTC in the language's order", () => {
    const at = new Date("2026-11-06T00:18:00Z");
    expect(formatDateTime(at, "en")).toBe("6 Nov 2026, 00:18");
    expect(formatDateTime(at, "es")).toContain("2026");
    expect(formatDateTime(at, "es")).toContain("0:18");
  });

  it("plural treats exactly one as singular", () => {
    expect(plural(1, "task", "tasks")).toBe("task");
    expect(plural(0, "task", "tasks")).toBe("tasks");
    expect(plural(2, "tarea", "tareas")).toBe("tareas");
  });
});

describe("the system templates", () => {
  it("the English catalog says exactly what the templates are made of", () => {
    for (const [key, template] of Object.entries(SYSTEM_TEMPLATES)) {
      const text = en.systemTemplates[key as keyof typeof en.systemTemplates];
      expect(text.name, key).toBe(template.name);
      expect(text.description, key).toBe(template.description);
      expect(text.stages, key).toEqual(
        template.stages.map((s) => ({ name: s.name, policy: s.policy })),
      );
    }
    expect(Object.keys(en.systemTemplates).sort()).toEqual(
      Object.keys(SYSTEM_TEMPLATES).sort(),
    );
  });

  it("Spanish renames the stages and keeps what the metrics depend on", () => {
    for (const [key, template] of Object.entries(SYSTEM_TEMPLATES)) {
      const spanish = localizeTemplate(key, template, "es");
      expect(spanish.stages.map((s) => s.name)).not.toEqual(
        template.stages.map((s) => s.name),
      );
      expect(
        spanish.stages.map(({ category, wipLimit, isCommitmentPoint }) => ({
          category,
          wipLimit,
          isCommitmentPoint,
        })),
      ).toEqual(
        template.stages.map(({ category, wipLimit, isCommitmentPoint }) => ({
          category,
          wipLimit,
          isCommitmentPoint,
        })),
      );
      // Still a valid flow, with the stage names still distinct.
      expect(validateFlow(spanish.stages)).toBeNull();
      expect(localizeTemplate(key, template, "en")).toEqual(template);
    }
    // A template with no translation is left alone.
    const own = SYSTEM_TEMPLATES.generic!;
    expect(localizeTemplate("nothing", own, "es")).toBe(own);
  });
});

describe("flow problems and history lines", () => {
  const stage = (
    name: string,
    category: FlowStage["category"],
    extra: Partial<FlowStage> = {},
  ): FlowStage => ({
    name,
    category,
    wipLimit: null,
    policy: null,
    isCommitmentPoint: false,
    ...extra,
  });

  it("the same problem reads in both languages, and the API sentence stays English", () => {
    const stages = [
      stage("Doing", "ACTIVE", { isCommitmentPoint: true }),
      stage("Todo", "BACKLOG"),
      stage("Done", "DONE"),
      stage("Dropped", "DISCARDED"),
    ];
    const problem = flowProblem(stages)!;
    expect(problem.code).toBe("ORDER");
    expect(describeFlowProblem(problem, en)).toBe(validateFlow(stages));
    expect(validateFlow(stages)).toContain('"Todo" (to do) cannot come after');
    expect(describeFlowProblem(problem, es)).toContain("no puede ir después");
    expect(describeFlowProblem({ code: "COMMITMENT_COUNT" }, es)).toBe(
      "Elige exactamente un punto de compromiso",
    );
    expect(flowProblem(SYSTEM_TEMPLATES.software!.stages)).toBeNull();
  });

  it("a history line reads in both languages, also for a removed stage", () => {
    const event = {
      type: "MOVED" as const,
      fromStage: { name: "A" },
      toStage: null,
      actor: "Ana",
    };
    expect(describeEvent(event)).toBe("Ana moved it from A to a removed stage");
    expect(describeEvent(event, es)).toBe(
      "Ana la movió de A a una etapa eliminada",
    );
  });

  it("due dates follow the language and not the time zone", () => {
    expect(formatDueDate("2026-03-01")).toBe("Mar 1, 2026");
    expect(formatDueDate("2026-03-01", "es")).toBe("1 mar 2026");
  });
});

describe("alerts as data", () => {
  const samples = [
    ["WIP_OVER_LIMIT", { stage: "Code review", days: 4, count: 5, limit: 3 }],
    ["BAND_WIDENING", { stage: "Testing", from: 2, to: 6, days: 3 }],
    ["TASK_AGING", { title: "Fix login", days: 12.34, p85: 8.5 }],
    ["TASK_AGING", { title: null, days: 12.34, p85: 8.5 }],
    [
      "THROUGHPUT_DROP",
      { week: "2026-10-26", count: 1, average: 4.25, percent: 76 },
    ],
  ] as const;

  it("every alert reads in both languages, with the same figures", () => {
    for (const [kind, params] of samples) {
      const english = describeAlert(kind, params as never, "en");
      const spanish = describeAlert(kind, params as never, "es");
      expect(spanish, kind).not.toBe(english);
      for (const value of Object.values(params)) {
        if (typeof value === "string") expect(spanish).toContain(value);
      }
    }
    expect(describeAlert("TASK_AGING", samples[2][1] as never, "en")).toBe(
      '"Fix login" has been in progress for 12.3 days, longer than 85% of finished tasks (8.5 days).',
    );
    expect(describeAlert("TASK_AGING", samples[2][1] as never, "es")).toContain(
      "12,3 días",
    );
    expect(describeAlert("TASK_AGING", samples[3][1] as never, "es")).toContain(
      "Una tarea",
    );
  });

  it("a stored alert reads from its data, and an old one with no data keeps its English sentence", () => {
    const row = {
      kind: "WIP_OVER_LIMIT" as const,
      message: "the English sentence stored back then",
      params: samples[0][1],
    };
    expect(notificationText(row, "es")).toContain("límite de WIP");
    expect(notificationText(row, "en")).toContain("over its WIP limit");
    expect(notificationText({ ...row, params: null }, "es")).toBe(row.message);
  });

  it("the detector still says English in its own message, built from the same data", () => {
    // A stage over its limit for the whole window.
    const metrics = {
      cfd: {
        days: ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"],
        series: [{ bucket: "s1", category: "ACTIVE", counts: [5, 5, 5, 5] }],
      },
      cycleTime: { count: 0, p50: null, p85: null, p95: null },
      age: [],
      throughput: { weekly: [], daily: [], total: 0 },
    } as never;
    const [alert] = detectAlerts(
      metrics,
      [{ id: "s1", name: "Doing", category: "ACTIVE", wipLimit: 3 }],
      DEFAULT_ALERTS,
    );
    expect(alert!.kind).toBe("WIP_OVER_LIMIT");
    expect(alert!.message).toBe(
      describeAlert(alert!.kind, alert!.params as never, "en"),
    );
    expect(alert!.message).toBe(
      '"Doing" has been over its WIP limit for 4 days (5 of 3). Finish something before pulling more in.',
    );
  });
});

describe("what a bad query says", () => {
  const messageOf = (run: () => unknown) => {
    try {
      run();
    } catch (error) {
      return (error as z.ZodError).issues.map((i) => i.message);
    }
    throw new Error("it did not fail");
  };
  const NOW = Date.parse("2026-11-05T12:00:00Z");

  it("every sentence the validators raise has a Spanish translation", () => {
    const failures = [
      () => parseMetricsQuery({ from: "2026-13-01" }, NOW),
      () => parseMetricsQuery({ to: "2026-12-31" }, NOW),
      () => parseMetricsQuery({ from: "2026-10-10", to: "2026-10-01" }, NOW),
      () => parseMetricsQuery({ from: "2024-01-01", to: "2026-11-01" }, NOW),
      () => parseForecastQuery({ items: "1.5" }, NOW),
      () => parseForecastQuery({ items: "0" }, NOW),
      () => parseForecastQuery({ items: "99999" }, NOW),
      () => parseForecastQuery({ seed: "-1" }, NOW),
      () => parseForecastQuery({ seed: "9999999999" }, NOW),
      () => parseForecastQuery({ items: "3", date: "2026-12-01" }, NOW),
      () => parseForecastQuery({ date: "2026-11-01" }, NOW),
      () => parseForecastQuery({ date: "2030-01-01" }, NOW),
    ];
    for (const failure of failures) {
      for (const message of messageOf(failure)) {
        const spanish = translateQueryError(message, es);
        expect(spanish, message).not.toBe(message);
        expect(translateQueryError(message, en)).toBe(message);
      }
    }
    // What the validation library says on its own is shown as it is.
    expect(translateQueryError("Unrecognized key", es)).toBe(
      "Unrecognized key",
    );
  });

  it("the forecast warns about a thin history in data, and only then", () => {
    expect(forecastWarnings({ daysWithData: 30, finished: 40 })).toEqual([]);
    expect(
      forecastWarnings({ daysWithData: 3, finished: 2 }).map((w) => w.code),
    ).toEqual(["FEW_DAYS", "FEW_TASKS"]);
  });
});

describe("the sample data in Spanish", () => {
  const TODAY = Date.parse("2026-10-28T00:00:00Z");
  const english = generateDemo(TODAY);
  const spanish = generateDemo(TODAY, undefined, "es");

  it("is the same history with other words: the same numbers, stages and moments", () => {
    const shape = (lists: typeof english) =>
      lists.map((l) => ({
        tasks: l.tasks.length,
        events: l.tasks.map((t) =>
          t.events.map((e) => [e.type, e.at, e.stage, e.fromStage, e.actor]),
        ),
        types: l.tasks.map((t) => t.type),
        priorities: l.tasks.map((t) => t.priority),
        blocked: l.tasks.map((t) => t.blockedReason !== null),
      }));
    expect(shape(spanish)).toEqual(shape(english));
  });

  it("has Spanish titles and blocking reasons", () => {
    const titles = (lists: typeof english) =>
      lists.flatMap((l) => l.tasks.map((t) => t.title));
    expect(titles(spanish)).not.toEqual(titles(english));
    expect(
      titles(spanish).some((t) => /^(Corregir|Añadir|Mejorar)/.test(t)),
    ).toBe(true);
    // A task is blocked at the end of the history only for some seeds: look through a few.
    const reasons = Array.from({ length: 40 }, (_, i) => i + 1).flatMap(
      (seed) =>
        generateDemo(TODAY, seed, "es").flatMap((l) =>
          l.tasks.flatMap((t) => (t.blockedReason ? [t.blockedReason] : [])),
        ),
    );
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.every((r) => es.sample.blocks.includes(r))).toBe(true);
  });
});
