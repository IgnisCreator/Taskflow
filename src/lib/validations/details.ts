import { z } from "zod";

// Subtasks and comments: small writes inside a task. They do not use the board version.
export const MAX_SUBTASKS = 50;

export const createSubtaskSchema = z.strictObject({
  title: z.string().trim().min(1).max(160),
});

export const updateSubtaskSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(160).optional(),
    done: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.done !== undefined, {
    message: "Provide a title or the done state",
  });

export const createCommentSchema = z.strictObject({
  body: z.string().trim().min(1).max(2000),
});

/** The two lists a workspace keeps: kinds of work and labels. */
export const CATALOGS = ["types", "labels"] as const;
export type Catalog = (typeof CATALOGS)[number];
export const MAX_CATALOG: Record<Catalog, number> = { types: 30, labels: 100 };

export const catalogItemSchema = z.strictObject({
  name: z.string().trim().min(1).max(40),
});
