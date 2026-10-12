import { z } from "zod";
import { CATEGORIES, MAX_STAGES } from "@/lib/workflow";

const name = z.string().trim().min(1).max(40);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((value) => value || null);

/** One stage as the editor sends it. `id` is present for a stage that already exists. */
export const stageSchema = z.strictObject({
  id: z.string().min(1).max(100).optional(),
  name,
  category: z.enum(CATEGORIES),
  wipLimit: z.number().int().min(1).max(999).nullable(),
  policy: optionalText(300),
  isCommitmentPoint: z.boolean(),
});

/**
 * Replaces the whole flow of a list. Stages without `id` are created, stages with `id` are updated
 * and reordered, existing stages missing from the list are removed; `moveTo` says, for each removed
 * stage that holds tasks, the index (in `stages`) of the stage that receives them.
 */
export const putFlowSchema = z.strictObject({
  expectedBoardVersion: z.number().int().min(0),
  stages: z.array(stageSchema).min(1).max(MAX_STAGES),
  moveTo: z.record(z.string(), z.number().int().min(0)).default({}),
});

export const templateSchema = z.strictObject({
  name: z.string().trim().min(1).max(60),
  fromListId: z.string().min(1).max(100),
});

export const renameTemplateSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(60).optional(),
    fromListId: z.string().min(1).max(100).optional(),
  })
  .refine((v) => v.name !== undefined || v.fromListId !== undefined, {
    message: "Provide a name or a list to copy the flow from",
  });

export type StageInput = z.infer<typeof stageSchema>;
export type PutFlowInput = z.infer<typeof putFlowSchema>;
