import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ForecastPanel } from "@/components/forecast-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { parseForecastPageQuery } from "@/lib/validations/forecast";
import { translateQueryError } from "@/lib/validations/query-errors";
import { getT } from "@/server/i18n";
import { limitForecast } from "@/server/http";
import { currentTime, loadUser, loadWorkspace } from "@/server/load";
import { getListForecast } from "@/server/services/forecast";
import { getList } from "@/server/services/lists";

/** Monte Carlo forecast of one list. Anyone who can see the list can read it. */
export default async function ListForecastPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await loadUser();
  const { t } = await getT();
  const { listId } = await params;
  const list = await getList(user.id, listId);
  if (!list) notFound();
  await limitForecast(user.id, await headers());
  const raw = await searchParams;
  const now = currentTime();
  const { query, error } = parseForecastPageQuery(raw, now, (message) =>
    translateQueryError(message, t),
  );
  const [workspace, forecast] = await Promise.all([
    loadWorkspace(user.id, list.workspaceId),
    getListForecast(user.id, listId, query, now),
  ]);
  // The query as it came, strings only, so that a link can change one part and keep the rest.
  const kept = Object.fromEntries(
    Object.entries(raw).filter(
      (entry): entry is [string, string] =>
        typeof entry[1] === "string" && entry[1] !== "" && !error,
    ),
  );

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <p className="text-sm">
          <Link href={`/lists/${list.id}`} className="link">
            &larr; {list.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">
          {t.forecast.title(list.name)}
        </h1>
        <p className="text-muted">{t.forecast.intro}</p>
        <ForecastPanel
          forecast={forecast}
          basePath={`/lists/${list.id}/forecast`}
          params={kept}
          error={error}
        />
      </main>
    </WorkspaceShell>
  );
}
