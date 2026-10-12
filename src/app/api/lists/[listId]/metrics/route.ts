import { parseMetricsQuery } from "@/lib/validations/metrics";
import { handle, json, requireUser } from "@/server/http";
import { getListMetrics } from "@/server/services/metrics";

type Context = { params: Promise<{ listId: string }> };

/** The flow metrics of a list: ?from=&to= (days, UTC), ?type=, ?assignee= (an id or "none"). */
export const GET = handle(async (request: Request, { params }: Context) => {
  const user = await requireUser();
  const query = parseMetricsQuery(
    Object.fromEntries(new URL(request.url).searchParams),
    Date.now(),
  );
  return json(await getListMetrics(user.id, (await params).listId, query));
});
