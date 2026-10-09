import {
  createProjectSchema,
  listProjectsQuerySchema,
} from "@/lib/validations/projects";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createProject, listProjects } from "@/server/services/projects";

export const GET = handle(async (request: Request) => {
  const user = await requireUser();
  const query = listProjectsQuerySchema.parse(
    Object.fromEntries(new URL(request.url).searchParams),
  );
  return json(await listProjects(user.id, query));
});

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, createProjectSchema);
  return json(await createProject(user.id, input), 201);
});
