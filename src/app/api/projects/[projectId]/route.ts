import { deleteProjectSchema } from "@/lib/validations/projects";
import {
  ApiError,
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import { deleteProject, getProject } from "@/server/services/projects";

type Context = { params: Promise<{ projectId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  const project = await getProject(user.id, (await params).projectId);
  if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found");
  return json(project);
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { expectedBoardVersion } = await readJson(request, deleteProjectSchema);
  await deleteProject(user.id, (await params).projectId, expectedBoardVersion);
  return noContent();
});
