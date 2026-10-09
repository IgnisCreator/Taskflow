import { z } from "zod";

/** Value of the assignee filter that means "no assignee". */
export const UNASSIGNED = "none";

const text = z.string().trim().min(1).max(100);

export type TaskFilter = {
  q?: string;
  assignee?: string;
  priority?: "LOW" | "MEDIUM" | "HIGH";
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
  };
}

export const isFiltered = (filter: TaskFilter) =>
  Object.values(filter).some((value) => value !== undefined);
