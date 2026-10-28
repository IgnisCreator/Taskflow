import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricsPanel } from "@/components/metrics-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { parseMetricsPageQuery } from "@/lib/validations/metrics";
import { currentTime, loadUser, loadWorkspace } from "@/server/load";
import { listCatalog } from "@/server/services/catalog";
import { getList } from "@/server/services/lists";
import { listMembers } from "@/server/services/members";
import { getListMetrics } from "@/server/services/metrics";

/** Flow metrics of one list. Anyone who can see the list can read them. */
export default async function ListMetricsPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await loadUser();
  const { listId } = await params;
  const list = await getList(user.id, listId);
  if (!list) notFound();
  const now = currentTime();
  const { query, error } = parseMetricsPageQuery(await searchParams, now);
  const [workspace, catalog, members, metrics] = await Promise.all([
    loadWorkspace(user.id, list.workspaceId),
    listCatalog(user.id, list.workspaceId),
    listMembers(user.id, list.workspaceId),
    getListMetrics(user.id, listId, query, now),
  ]);

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <p className="text-sm">
          <Link href={`/lists/${list.id}`} className="link">
            &larr; {list.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Metrics of {list.name}</h1>
        <MetricsPanel
          metrics={metrics}
          basePath={`/lists/${list.id}/metrics`}
          now={now}
          error={error}
          filter={query}
          types={catalog.types}
          members={members}
        />
      </main>
    </WorkspaceShell>
  );
}
