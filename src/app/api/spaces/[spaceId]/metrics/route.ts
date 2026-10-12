import { parseMetricsQuery } from "@/lib/validations/metrics";
import { handle, json, requireUser } from "@/server/http";
import { getSpaceMetrics } from "@/server/services/metrics";

type Context = { params: Promise<{ spaceId: string }> };

/** The flow metrics of every list of a space together, grouped by category. */
export const GET = handle(async (request: Request, { params }: Context) => {
  const user = await requireUser();
  const query = parseMetricsQuery(
    Object.fromEntries(new URL(request.url).searchParams),
    Date.now(),
  );
  return json(await getSpaceMetrics(user.id, (await params).spaceId, query));
});
