import { describe, expect, it } from "vitest";
import { describeEvent } from "../../src/lib/events";
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
