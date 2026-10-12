import { putFlowSchema } from "@/lib/validations/workflow";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { applyFlow } from "@/server/services/flow";

type Context = { params: Promise<{ listId: string }> };

export const PUT = handle(async (request: Request, { params }: Context) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, putFlowSchema);
  return json(await applyFlow(user.id, (await params).listId, input));
});
