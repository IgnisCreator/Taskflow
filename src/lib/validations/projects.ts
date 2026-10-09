import { z } from "zod";

// Unknown keys are rejected (not stripped): the client must never send ownerId, createdById, etc.
export const createProjectSchema = z.strictObject({
  name: z.string().trim().min(1).max(80),
  description: z
    .string()
    .trim()
    .max(5000)
    .optional()
    .transform((value) => value || null),
});

export const listProjectsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(100).optional(),
});

export const deleteProjectSchema = z.strictObject({
  expectedBoardVersion: z.number().int().min(0),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
