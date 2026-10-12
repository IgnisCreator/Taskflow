import { ApiForm } from "@/components/api-form";
import { CatalogSection } from "@/components/catalog-section";
import { MembersPanel } from "@/components/members-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { roleLabel } from "@/lib/roles";
import { ROLES } from "@/lib/validations/workspaces";
import { loadUser, loadWorkspace } from "@/server/load";
import { can } from "@/server/policies";
import { listCatalog } from "@/server/services/catalog";
import { listMembers } from "@/server/services/members";
import { listTemplates } from "@/server/services/templates";

export default async function WorkspaceSettingsPage({
  params,
}: {
  params: Promise<{ workspaceId: string }>;
}) {
  const user = await loadUser();
  const workspace = await loadWorkspace(user.id, (await params).workspaceId);
  const members = await listMembers(user.id, workspace.id);
  const templates = await listTemplates(user.id, workspace.id);
  const catalog = await listCatalog(user.id, workspace.id);
  const url = `/api/workspaces/${workspace.id}`;

  return (
    <WorkspaceShell workspace={workspace}>
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold">Workspace settings</h1>
        {can(workspace, "workspace:edit") ? (
          <>
            <ApiForm
              method="PATCH"
              url={url}
              submit="Save name"
              className="card space-y-3"
            >
              <h2 className="text-lg font-semibold">Name</h2>
              <label className="field">
                Workspace name
                <input
                  name="name"
                  required
                  maxLength={80}
                  defaultValue={workspace.name}
                  className="input"
                />
              </label>
            </ApiForm>
            <RoleLabelsForm url={url} labels={workspace.roleLabels} />
          </>
        ) : (
          <p className="card text-muted">
            Only the owner and admins can change these settings.
          </p>
        )}
        {can(workspace, "structure:manage") && (
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">Flow templates</h2>
            <p className="text-sm text-muted">
              Flows saved from a list (use &ldquo;Save as template&rdquo; on a
              list workflow page). The system templates are always available and
              cannot be edited.
            </p>
            {templates.organisation.length === 0 && (
              <p className="text-sm text-muted">No templates saved yet.</p>
            )}
            <ul className="space-y-3">
              {templates.organisation.map((template) => (
                <li
                  key={template.ref}
                  className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
                >
                  <ApiForm
                    method="PATCH"
                    url={`/api/templates/${template.ref}`}
                    submit="Rename"
                    className="flex flex-1 flex-wrap items-end gap-2"
                  >
                    <label className="field flex-1">
                      Template name
                      <input
                        name="name"
                        required
                        maxLength={60}
                        defaultValue={template.name}
                        className="input"
                      />
                    </label>
                  </ApiForm>
                  <span className="text-sm text-muted">
                    {template.stages.length} stages
                  </span>
                  <ApiForm
                    method="DELETE"
                    url={`/api/templates/${template.ref}`}
                    submit={`Delete ${template.name}`}
                    danger
                    className="flex items-end gap-2"
                  />
                </li>
              ))}
            </ul>
          </section>
        )}
        {can(workspace, "structure:manage") && (
          <>
            <CatalogSection
              workspaceId={workspace.id}
              kind="types"
              title="Task types"
              help="The kinds of work your team handles (a task, a bug, a request...). Metrics can be split by type."
              items={catalog.types}
            />
            <CatalogSection
              workspaceId={workspace.id}
              kind="labels"
              title="Labels"
              help="Free tags any task can carry, to group work across lists."
              items={catalog.labels}
            />
          </>
        )}
        <MembersPanel
          workspaceId={workspace.id}
          members={members}
          actor={workspace}
          labels={workspace.roleLabels}
        />
        {can(workspace, "workspace:delete") && (
          <ApiForm
            method="DELETE"
            url={url}
            redirectTo="/workspaces"
            submit="Delete workspace"
            danger
            confirmText={workspace.name}
            className="card-danger space-y-3"
          >
            <h2 className="text-lg font-semibold text-danger-text">
              Delete workspace
            </h2>
            <p className="text-sm text-muted">
              This permanently deletes every space, list and task in it.
            </p>
          </ApiForm>
        )}
      </main>
    </WorkspaceShell>
  );
}

/** Renaming a role changes only what people see; what each role may do stays the same. */
function RoleLabelsForm({
  url,
  labels,
}: {
  url: string;
  labels: Record<string, string>;
}) {
  return (
    <ApiForm
      method="PATCH"
      url={url}
      submit="Save role names"
      className="card space-y-3"
    >
      <h2 className="text-lg font-semibold">Role names</h2>
      <p className="text-sm text-muted">
        Call the roles what your team calls them, for example Client instead of
        Guest. Permissions do not change. Leave a field empty to use the default
        name.
      </p>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">Role names</legend>
        {ROLES.map((role) => (
          <label key={role} className="field">
            {roleLabel({}, role)}
            <input
              name={`roleLabels.${role}`}
              maxLength={30}
              defaultValue={labels[role] ?? ""}
              placeholder={roleLabel({}, role)}
              className="input"
            />
          </label>
        ))}
      </fieldset>
    </ApiForm>
  );
}
