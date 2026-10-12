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
export const MAX_ASSIGNEES = 10;
export const MAX_LABELS = 10;
const id = z.string().min(1).max(100);
/** Distinct ids (a repeated one is a client bug, not something to fix silently). */
const idList = (max: number) =>
  z
    .array(id)
    .max(max)
    .refine((ids) => new Set(ids).size === ids.length, "Ids must be distinct");
const blockedReason = z.string().trim().min(1).max(300).nullable();
const dueDate = z
  .string()
  .refine(isCalendarDate, "Use a real date as YYYY-MM-DD")
  .nullable();
const expectedBoardVersion = z.number().int().min(0);

// Unknown keys are rejected: createdById, listId, position... never come from the client.
export const createTaskSchema = z.strictObject({
  /** Chosen by the client so that retrying a lost response cannot create a duplicate. */
  id: z.uuid(),
  columnId: z.string().min(1).max(100),
  title,
  description: description.optional().transform((value) => value ?? null),
  priority: priority.default("MEDIUM"),
  assigneeIds: idList(MAX_ASSIGNEES).default([]),
  typeId: id.nullable().default(null),
  labelIds: idList(MAX_LABELS).default([]),
  dueDate: dueDate.default(null),
  expectedBoardVersion,
});

// Column and position are not editable here; moving a task is a separate operation (TF-06).
export const updateTaskSchema = z
  .strictObject({
    title: title.optional(),
    description: description.optional(),
    priority: priority.optional(),
    assigneeIds: idList(MAX_ASSIGNEES).optional(),
    typeId: id.nullable().optional(),
    labelIds: idList(MAX_LABELS).optional(),
    dueDate: dueDate.optional(),
    /** A reason blocks the task; null unblocks it. The time spent blocked is measured from the events. */
    blockedReason: blockedReason.optional(),
    expectedBoardVersion,
  })
  .refine(
    ({ expectedBoardVersion: _version, ...changes }) =>
      Object.values(changes).some((value) => value !== undefined),
    { message: "Provide at least one field to change" },
  );

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;

// Moving: the destination column and the final index there (0 = first), without counting the task.
export const moveTaskSchema = z.strictObject({
  columnId: z.string().min(1).max(100),
  toIndex: z.number().int().min(0),
  expectedBoardVersion,
});

export type MoveTaskInput = z.infer<typeof moveTaskSchema>;
