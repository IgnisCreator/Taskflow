import { createTaskSchema } from "@/lib/validations/tasks";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createTask } from "@/server/services/tasks";

type Context = { params: Promise<{ projectId: string }> };

export const POST = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, createTaskSchema);
  const { created, ...body } = await createTask(
    user.id,
    (await params).projectId,
    input,
  );
  // 201 for a new task, 200 when the same id was already created (a safe retry).
  return json(body, created ? 201 : 200);
});
