import { moveTaskSchema } from "@/lib/validations/tasks";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { moveTask } from "@/server/services/tasks";

type Context = { params: Promise<{ projectId: string; taskId: string }> };

export const PATCH = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const { projectId, taskId } = await params;
  const input = await readJson(request, moveTaskSchema);
  return json(await moveTask(user.id, projectId, taskId, input));
});
