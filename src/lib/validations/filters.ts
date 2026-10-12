import { z } from "zod";

/** Value of the assignee and type filters that means "nobody" / "no type". */
export const UNASSIGNED = "none";

const text = z.string().trim().min(1).max(100);

export type TaskFilter = {
  q?: string;
  assignee?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
  /** A task type id, or "none" for tasks without a type. */
  type?: string;
  /** A label id. */
  label?: string;
  /** Only blocked tasks, or only those that are not. */
  blocked?: "yes" | "no";
};

/**
 * Reads the filters from URL search params. Each field is checked on its own and an invalid or
 * repeated value is ignored, so a hand-edited URL never breaks the page.
 */
export function parseFilter(
  params: Record<string, string | string[] | undefined>,
): TaskFilter {
  const pick = <T extends z.ZodType>(key: string, schema: T) => {
    const parsed = schema.safeParse(params[key]);
    return parsed.success ? (parsed.data as z.infer<T>) : undefined;
  };
  return {
    q: pick("q", text),
    assignee: pick("assignee", text),
    priority: pick("priority", z.enum(["LOW", "MEDIUM", "HIGH"])),
    type: pick("type", text),
    label: pick("label", text),
    blocked: pick("blocked", z.enum(["yes", "no"])),
  };
}

export const isFiltered = (filter: TaskFilter) =>
  Object.values(filter).some((value) => value !== undefined);
