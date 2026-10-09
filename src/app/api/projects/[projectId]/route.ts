import {
  updateProjectSchema,
  versionedSchema,
} from "@/lib/validations/projects";
import {
  ApiError,
  assertSameOrigin,
  handle,
  json,
  noContent,
  readJson,
  requireUser,
} from "@/server/http";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/server/services/projects";

type Context = { params: Promise<{ projectId: string }> };

export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  const project = await getProject(user.id, (await params).projectId);
  if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found");
  return json(project);
});

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, updateProjectSchema);
  return json(await updateProject(user.id, (await params).projectId, input));
});

export const DELETE = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { expectedBoardVersion } = await readJson(request, versionedSchema);
  await deleteProject(user.id, (await params).projectId, expectedBoardVersion);
  return noContent();
});
