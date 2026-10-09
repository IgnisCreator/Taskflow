import { z } from "zod";

const name = z.string().trim().min(1).max(80);
// Empty text is stored as null.
const description = z
  .string()
  .trim()
  .max(5000)
  .transform((value) => value || null);

// Unknown keys are rejected (not stripped): the client must never send ownerId, createdById, etc.
export const createProjectSchema = z.strictObject({
  name,
  description: description.optional().transform((value) => value ?? null),
});

export const updateProjectSchema = z
  .strictObject({
    name: name.optional(),
    description: description.optional(),
    expectedBoardVersion: z.number().int().min(0),
  })
  .refine(
    (value) => value.name !== undefined || value.description !== undefined,
    {
      message: "Provide a name or a description",
    },
  );

export const listProjectsQuerySchema = z.strictObject({
  limit: z.coerce.number().int().min(1).max(50).default(20),
  cursor: z.string().min(1).max(100).optional(),
});

/** Body of every write that only needs the version (project delete, member removal). */
export const versionedSchema = z.strictObject({
  expectedBoardVersion: z.number().int().min(0),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type ListProjectsQuery = z.infer<typeof listProjectsQuerySchema>;
