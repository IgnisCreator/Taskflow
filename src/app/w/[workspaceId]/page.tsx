import Link from "next/link";
import { ApiForm } from "@/components/api-form";
import { TemplateSelect } from "@/components/template-select";
import { WorkspaceShell } from "@/components/workspace-shell";
import { roleLabel } from "@/lib/roles";
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
  const workspace = await loadWorkspace(user.id, (await params).workspaceId);
  const admin = can(workspace, "structure:manage");
  const now = currentTime();
  const last30 = parseMetricsQuery({}, now);
  const [templates, summaries] = await Promise.all([
    listTemplates(user.id, workspace.id),
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
            {roleLabel(workspace.roleLabels, workspace.role)}
          </span>
        </div>

        {workspace.spaces.length === 0 && (
          <p className="card text-muted">
            There are no spaces you can see yet. An admin can add you to one.
          </p>
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
                  {space.isPrivate && <span className="badge">private</span>}
                </h2>
                <dl
                  aria-label={`Last 30 days in ${space.name}`}
                  className="grid grid-cols-3 gap-2 text-sm"
                >
                  <div>
                    <dt className="text-muted">Finished</dt>
                    <dd className="font-semibold">
                      {summary.throughput.total}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">Median cycle</dt>
                    <dd className="font-semibold">
                      {summary.cycleTime.p50 === null
                        ? "-"
                        : `${summary.cycleTime.p50.toFixed(1)} days`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-muted">In progress</dt>
                    <dd className="font-semibold">{summary.wip.total}</dd>
                  </div>
                </dl>
                <Link
                  href={`/spaces/${space.id}/metrics`}
                  className="link block text-sm"
                >
                  Metrics of {space.name}
                </Link>
                {lists.length === 0 ? (
                  <p className="text-sm text-muted">No lists yet.</p>
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
                    submit="Create list"
                    className="space-y-2 border-t border-line pt-3"
                  >
                    <label className="field">
                      New list
                      <input
                        name="name"
                        required
                        maxLength={80}
                        className="input"
                      />
                    </label>
                    <TemplateSelect
                      name="templateId"
                      label="Workflow"
                      none="Default for this space or folder"
                      templates={templates}
                    />
                    {space.folders.length > 0 && (
                      <label className="field">
                        Folder
                        <select
                          name="folderId"
                          defaultValue=""
                          className="input"
                        >
                          <option value="">No folder</option>
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
            submit="Create space"
            className="card space-y-3"
          >
            <h2 className="text-lg font-semibold">New space</h2>
            <p className="text-sm text-muted">
              A space groups the lists of one area, such as Software or Support.
            </p>
            <label className="field">
              Name
              <input name="name" required maxLength={80} className="input" />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="isPrivate" />
              Private: only admins and the people you add can see it
            </label>
          </ApiForm>
        )}
      </main>
    </WorkspaceShell>
  );
}
