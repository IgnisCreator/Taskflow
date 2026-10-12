import "server-only";
import { z } from "zod";
import { stageSchema } from "@/lib/validations/workflow";
import {
  DEFAULT_TEMPLATE,
  SYSTEM_TEMPLATES,
  systemTemplate,
  validateFlow,
  type FlowStage,
} from "@/lib/workflow";
import { db } from "@/server/db";
import { ApiError } from "@/server/http";
import { notFound, withWorkspaceLock, type Tx } from "@/server/locks";

const MAX_TEMPLATES = 30;
// What is stored in WorkflowTemplate.stages: the stage shape without ids.
const storedStages = z.array(stageSchema.omit({ id: true }));

const toFlow = (stages: unknown): FlowStage[] => storedStages.parse(stages);

/** The flow of a list as a template body. Null when the list is not a valid flow yet. */
async function flowOfList(tx: Tx, workspaceId: string, listId: string) {
  const list = await tx.list.findFirst({
    where: { id: listId, space: { workspaceId } },
    select: {
      columns: {
        orderBy: { position: "asc" },
        select: {
          name: true,
          category: true,
          wipLimit: true,
          policy: true,
          isCommitmentPoint: true,
        },
      },
    },
  });
  if (!list) throw notFound("List");
  const problem = validateFlow(list.columns);
  if (problem) throw new ApiError(400, "INVALID_FLOW", problem);
  return list.columns;
}

/** System templates and the organisation's own, for pickers (members only: others get 404). */
export async function listTemplates(userId: string, workspaceId: string) {
  const workspace = await db.workspace.findFirst({
    where: { id: workspaceId, members: { some: { userId } } },
    select: {
      templates: {
        orderBy: { createdAt: "asc" },
        select: { id: true, name: true, stages: true },
      },
    },
  });
  if (!workspace) throw notFound("Workspace");
  return {
    system: Object.entries(SYSTEM_TEMPLATES).map(([key, template]) => ({
      ref: `system:${key}`,
      ...template,
    })),
    organisation: workspace.templates.map((template) => ({
      ref: template.id,
      name: template.name,
      stages: toFlow(template.stages),
    })),
  };
}

/** The stages behind a template reference ("system:<key>" or an id of this workspace), or null. */
export async function resolveTemplate(
  tx: Tx,
  workspaceId: string,
  ref: string | null | undefined,
): Promise<FlowStage[] | null> {
  if (!ref) return null;
  const system = systemTemplate(ref);
  if (system) return system.stages;
  const row = await tx.workflowTemplate.findFirst({
    where: { id: ref, workspaceId },
    select: { stages: true },
  });
  return row ? toFlow(row.stages) : null;
}

/** The flow a new list gets: the one asked for, else the folder's default, the space's, or generic. */
export async function flowForNewList(
  tx: Tx,
  workspaceId: string,
  space: { defaultTemplate: string | null },
  folder: { defaultTemplate: string | null } | null,
  asked: string | null,
): Promise<FlowStage[]> {
  if (asked) {
    const flow = await resolveTemplate(tx, workspaceId, asked);
    if (!flow)
      throw new ApiError(
        400,
        "INVALID_TEMPLATE",
        "That template does not exist",
      );
    return flow;
  }
  for (const ref of [folder?.defaultTemplate, space.defaultTemplate]) {
    // A default whose template was deleted just falls through to the next one.
    const flow = await resolveTemplate(tx, workspaceId, ref);
    if (flow) return flow;
  }
  return systemTemplate(DEFAULT_TEMPLATE)!.stages;
}

/** Throws unless `ref` is "system:<key>" or a template of this workspace (for setting a default). */
export async function assertTemplate(tx: Tx, workspaceId: string, ref: string) {
  if (!(await resolveTemplate(tx, workspaceId, ref))) {
    throw new ApiError(400, "INVALID_TEMPLATE", "That template does not exist");
  }
}

export async function createTemplate(
  userId: string,
  workspaceId: string,
  { name, fromListId }: { name: string; fromListId: string },
) {
  return withWorkspaceLock(
    userId,
    workspaceId,
    "structure:manage",
    async (tx) => {
      if (
        (await tx.workflowTemplate.count({ where: { workspaceId } })) >=
        MAX_TEMPLATES
      ) {
        throw new ApiError(
          409,
          "LIMIT_REACHED",
          `A workspace has at most ${MAX_TEMPLATES} templates`,
        );
      }
      const stages = await flowOfList(tx, workspaceId, fromListId);
      const row = await tx.workflowTemplate.create({
        data: { workspaceId, name, stages },
        select: { id: true, name: true },
      });
      return row;
    },
  );
}

async function workspaceOfTemplate(templateId: string) {
  const row = await db.workflowTemplate.findUnique({
    where: { id: templateId },
    select: { workspaceId: true },
  });
  if (!row) throw notFound("Template");
  return row.workspaceId;
}

/** Renames a template and/or replaces its stages with the current flow of a list. */
export async function updateTemplate(
  userId: string,
  templateId: string,
  changes: { name?: string; fromListId?: string },
) {
  const workspaceId = await workspaceOfTemplate(templateId);
  return withWorkspaceLock(
    userId,
    workspaceId,
    "structure:manage",
    async (tx) =>
      tx.workflowTemplate.update({
        where: { id: templateId },
        data: {
          name: changes.name,
          stages: changes.fromListId
            ? await flowOfList(tx, workspaceId, changes.fromListId)
            : undefined,
        },
        select: { id: true, name: true },
      }),
  );
}

/** Deletes the template and clears it as the default of any space or folder. */
export async function deleteTemplate(userId: string, templateId: string) {
  const workspaceId = await workspaceOfTemplate(templateId);
  await withWorkspaceLock(
    userId,
    workspaceId,
    "structure:manage",
    async (tx) => {
      await tx.space.updateMany({
        where: { workspaceId, defaultTemplate: templateId },
        data: { defaultTemplate: null },
      });
      await tx.folder.updateMany({
        where: { space: { workspaceId }, defaultTemplate: templateId },
        data: { defaultTemplate: null },
      });
      await tx.workflowTemplate.delete({ where: { id: templateId } });
    },
  );
}
