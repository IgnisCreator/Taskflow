import Link from "next/link";
import { ApiForm } from "@/components/api-form";
import { TemplateSelect } from "@/components/template-select";
import { WorkspaceShell } from "@/components/workspace-shell";
import { formatNumber } from "@/lib/i18n";
import { roleLabel } from "@/lib/roles";
import { getT } from "@/server/i18n";
import { currentTime, loadUser, loadWorkspace } from "@/server/load";
import { can } from "@/server/policies";
import { parseMetricsQuery } from "@/lib/validations/metrics";
import { getSpaceMetrics } from "@/server/services/metrics";
import { listTemplates } from "@/server/services/templates";

export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const user = await loadUser();
  const { lang, t } = await getT();
  const workspace = await loadWorkspace(user.id, (await params).workspaceId);
  const admin = can(workspace, "structure:manage");
  const now = currentTime();
  const last30 = parseMetricsQuery({}, now);
  const [templates, summaries] = await Promise.all([
    listTemplates(user.id, workspace.id, lang),
    Promise.all(
      workspace.spaces.map((space) =>
        getSpaceMetrics(user.id, space.id, last30, now),
      ),
    ),
  ]);

  return (
    <WorkspaceShell workspace={workspace}>
      <main className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">{workspace.name}</h1>
          <span className="badge normal-case">
            {roleLabel(workspace.roleLabels, workspace.role, t.roles)}
          </span>
        </div>

        {workspace.spaces.length === 0 && (
          <p className="card text-muted">{t.workspace.noSpaces}</p>
        )}
        <ul className="grid gap-4 sm:grid-cols-2">
          {workspace.spaces.map((space, index) => {
            const summary = summaries[index]!;
            const lists = [
              ...space.lists,
              ...space.folders.flatMap((folder) => folder.lists),
            ];
            return (
              <li key={space.id} className="card space-y-3">
                <h2 className="flex items-center justify-between gap-2 font-semibold">
                  {space.name}
                  {space.isPrivate && (
                    <span className="badge">{t.shell.private}</span>
                  )}
                </h2>
                <dl
                  aria-label={t.workspace.last30(space.name)}
                  className="grid grid-cols-3 gap-2 text-sm"
                >
                  <div>
                    <dt className="text-muted">{t.workspace.finished}</dt>
                    <dd className="font-semibold">
                      {summary.throughput.total}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t.workspace.medianCycle}</dt>
                    <dd className="font-semibold">
                      {summary.cycleTime.p50 === null
                        ? "-"
                        : t.units.days(
                            formatNumber(summary.cycleTime.p50, lang),
                          )}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">{t.workspace.inProgress}</dt>
                    <dd className="font-semibold">{summary.wip.total}</dd>
                  </div>
                </dl>
                <Link
                  href={`/spaces/${space.id}/metrics`}
                  className="link block text-sm"
                >
                  {t.shell.metricsOf(space.name)}
                </Link>
                {lists.length === 0 ? (
                  <p className="text-sm text-muted">{t.workspace.noLists}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {lists.map((list) => (
                      <li key={list.id}>
                        <Link href={`/lists/${list.id}`} className="link">
                          {list.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                )}
                {admin && (
                  <ApiForm
                    method="POST"
                    url="/api/lists"
                    extra={{ spaceId: space.id }}
                    redirectTo="/lists/{id}"
                    submit={t.workspace.createList}
                    className="space-y-2 border-t border-line pt-3"
                  >
                    <label className="field">
                      {t.workspace.newList}
                      <input
                        name="name"
                        required
                        maxLength={80}
                        className="input"
                      />
                    </label>
                    <TemplateSelect
                      name="templateId"
                      label={t.workspace.workflow}
                      none={t.workspace.defaultFlow}
                      templates={templates}
                    />
                    {space.folders.length > 0 && (
                      <label className="field">
                        {t.workspace.folder}
                        <select
                          name="folderId"
                          defaultValue=""
                          className="input"
                        >
                          <option value="">{t.workspace.noFolder}</option>
                          {space.folders.map((folder) => (
                            <option key={folder.id} value={folder.id}>
                              {folder.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    )}
                  </ApiForm>
                )}
              </li>
            );
          })}
        </ul>

        {admin && (
          <ApiForm
            method="POST"
            url={`/api/workspaces/${workspace.id}/spaces`}
            submit={t.workspace.createSpace}
            className="card space-y-3"
          >
            <h2 className="text-lg font-semibold">{t.workspace.newSpace}</h2>
            <p className="text-sm text-muted">{t.workspace.newSpaceHint}</p>
            <label className="field">
              {t.workspace.name}
              <input name="name" required maxLength={80} className="input" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPrivate" />
              {t.workspace.privateLabel}
            </label>
          </ApiForm>
        )}
      </main>
    </WorkspaceShell>
  );
}
