import { ApiForm } from "@/components/api-form";
import { CatalogSection } from "@/components/catalog-section";
import { MembersPanel } from "@/components/members-panel";
import { WorkspaceShell } from "@/components/workspace-shell";
import { roleLabel } from "@/lib/roles";
import { ROLES } from "@/lib/validations/workspaces";
import { getT } from "@/server/i18n";
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
  const { lang, t } = await getT();
  const workspace = await loadWorkspace(user.id, (await params).workspaceId);
  const members = await listMembers(user.id, workspace.id);
  const templates = await listTemplates(user.id, workspace.id, lang);
  const catalog = await listCatalog(user.id, workspace.id);
  const url = `/api/workspaces/${workspace.id}`;

  return (
    <WorkspaceShell workspace={workspace}>
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold">{t.settings.title}</h1>
        {can(workspace, "workspace:edit") ? (
          <>
            <ApiForm
              method="PATCH"
              url={url}
              submit={t.settings.saveName}
              className="card space-y-3"
            >
              <h2 className="text-lg font-semibold">
                {t.settings.nameHeading}
              </h2>
              <label className="field">
                {t.settings.workspaceName}
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
          <p className="card text-muted">{t.settings.onlyAdmins}</p>
        )}
        {can(workspace, "structure:manage") && (
          <section className="card space-y-3">
            <h2 className="text-lg font-semibold">
              {t.settings.templatesTitle}
            </h2>
            <p className="text-sm text-muted">{t.settings.templatesHelp}</p>
            {templates.organisation.length === 0 && (
              <p className="text-sm text-muted">{t.settings.noTemplates}</p>
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
                    submit={t.settings.rename}
                    className="flex flex-1 flex-wrap items-end gap-2"
                  >
                    <label className="field flex-1">
                      {t.settings.templateName}
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
                    {t.settings.stages(template.stages.length)}
                  </span>
                  <ApiForm
                    method="DELETE"
                    url={`/api/templates/${template.ref}`}
                    submit={t.settings.deleteNamed(template.name)}
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
              items={catalog.types}
            />
            <CatalogSection
              workspaceId={workspace.id}
              kind="labels"
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
            submit={t.settings.deleteWorkspace}
            danger
            confirmText={workspace.name}
            className="card-danger space-y-3"
          >
            <h2 className="text-lg font-semibold text-danger-text">
              {t.settings.deleteWorkspace}
            </h2>
            <p className="text-sm text-muted">
              {t.settings.deleteWorkspaceHint}
            </p>
          </ApiForm>
        )}
      </main>
    </WorkspaceShell>
  );
}

/** Renaming a role changes only what people see; what each role may do stays the same. */
async function RoleLabelsForm({
  url,
  labels,
}: {
  url: string;
  labels: Record<string, string>;
}) {
  const { t } = await getT();
  return (
    <ApiForm
      method="PATCH"
      url={url}
      submit={t.settings.saveRoleNames}
      className="card space-y-3"
    >
      <h2 className="text-lg font-semibold">{t.settings.roleNamesTitle}</h2>
      <p className="text-sm text-muted">{t.settings.roleNamesHelp}</p>
      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="sr-only">{t.settings.roleNamesTitle}</legend>
        {ROLES.map((role) => (
          <label key={role} className="field">
            {roleLabel({}, role, t.roles)}
            <input
              name={`roleLabels.${role}`}
              maxLength={30}
              defaultValue={labels[role] ?? ""}
              placeholder={roleLabel({}, role, t.roles)}
              className="input"
            />
          </label>
        ))}
      </fieldset>
    </ApiForm>
  );
}
