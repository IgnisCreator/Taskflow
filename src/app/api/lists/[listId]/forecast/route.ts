import { parseForecastQuery } from "@/lib/validations/forecast";
import { handle, json, requireUser } from "@/server/http";
import { getListForecast } from "@/server/services/forecast";

type Context = { params: Promise<{ listId: string }> };

/** A Monte Carlo forecast from the list's history: when `items` are done, or how many by `date`. */
export const GET = handle(async (request: Request, { params }: Context) => {
  const user = await requireUser();
  const query = parseForecastQuery(
    Object.fromEntries(new URL(request.url).searchParams),
    Date.now(),
  );
  return json(await getListForecast(user.id, (await params).listId, query));
});
