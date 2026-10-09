import { ApiError, handle, json, requireUser } from "@/server/http";
import { getProject } from "@/server/services/projects";

type Context = { params: Promise<{ projectId: string }> };

// Polled by open boards; any member may read it. Never cached (see json()).
export const GET = handle(async (_request: Request, { params }: Context) => {
  const user = await requireUser();
  const project = await getProject(user.id, (await params).projectId);
  if (!project) throw new ApiError(404, "NOT_FOUND", "Project not found");
  return json({ boardVersion: project.boardVersion });
});
