import { createListSchema } from "@/lib/validations/workspaces";
import {
  assertSameOrigin,
  handle,
  json,
  readJson,
  requireUser,
} from "@/server/http";
import { createList } from "@/server/services/lists";

export const POST = handle(async (request: Request) => {
  assertSameOrigin(request);
  const user = await requireUser();
  const input = await readJson(request, createListSchema);
  return json(await createList(user.id, input), 201);
});
