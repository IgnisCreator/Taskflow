import Link from "next/link";
import { notFound } from "next/navigation";
import { MetricsPanel } from "@/components/metrics-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { parseMetricsPageQuery } from "@/lib/validations/metrics";
import { ApiError } from "@/server/http";
import { currentTime, loadUser, loadWorkspace } from "@/server/load";
import { listCatalog } from "@/server/services/catalog";
import { listMembers } from "@/server/services/members";
import { getSpaceMetrics } from "@/server/services/metrics";

/** Flow metrics of every list of a space together, by category. Anyone who can see the space reads them. */
export default async function SpaceMetricsPage({
  params,
  searchParams,
}: {
  params: Promise<{ spaceId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await loadUser();
  const { spaceId } = await params;
  const now = currentTime();
  const { query, error } = parseMetricsPageQuery(await searchParams, now);
  const metrics = await getSpaceMetrics(user.id, spaceId, query, now).catch(
    (e) => {
      if (e instanceof ApiError && e.status === 404) notFound();
      throw e;
    },
  );
  const workspaceId = metrics.space.workspaceId;
  const [workspace, catalog, members] = await Promise.all([
    loadWorkspace(user.id, workspaceId),
    listCatalog(user.id, workspaceId),
    listMembers(user.id, workspaceId),
  ]);

  return (
    <WorkspaceShell workspace={workspace}>
      <main className="space-y-6">
        <p className="text-sm">
          <Link href={`/w/${workspaceId}`} className="link">
            &larr; {workspace.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">
          Metrics of the space {metrics.space.name}
        </h1>
        <p className="text-muted">
          All the lists of the space together. Their stages differ, so the
          charts group them by category.
        </p>
        <MetricsPanel
          metrics={metrics}
          basePath={`/spaces/${spaceId}/metrics`}
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
