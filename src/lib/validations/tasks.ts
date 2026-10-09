import { z } from "zod";
import { isCalendarDate } from "@/lib/dates";

export const MAX_TASKS = 200;

const title = z.string().trim().min(1).max(160);
// Empty text is stored as null.
const description = z
  .string()
  .trim()
  .max(5000)
  .transform((value) => value || null);
const priority = z.enum(["LOW", "MEDIUM", "HIGH"]);
const assigneeId = z.string().min(1).max(100).nullable();
const dueDate = z
  .string()
  .refine(isCalendarDate, "Use a real date as YYYY-MM-DD")
  .nullable();
const expectedBoardVersion = z.number().int().min(0);

// Unknown keys are rejected: createdById, projectId, position... never come from the client.
export const createTaskSchema = z.strictObject({
  /** Chosen by the client so that retrying a lost response cannot create a duplicate. */
  id: z.uuid(),
  columnId: z.string().min(1).max(100),
  title,
  description: description.optional().transform((value) => value ?? null),
  priority: priority.default("MEDIUM"),
  assigneeId: assigneeId.default(null),
  dueDate: dueDate.default(null),
  expectedBoardVersion,
});

// Column and position are not editable here; moving a task is a separate operation (TF-06).
export const updateTaskSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    priority: priority.optional(),
    assigneeId: assigneeId.optional(),
    dueDate: dueDate.optional(),
    expectedBoardVersion,
  })
  .refine(
    ({ expectedBoardVersion: _version, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "Provide at least one field to change" },
  );

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
