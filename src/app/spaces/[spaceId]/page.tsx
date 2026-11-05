import { notFound } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { SpaceAccess } from "@/components/space-access";
import { TemplateSelect } from "@/components/template-select";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getT } from "@/server/i18n";
import { loadUser, loadWorkspace } from "@/server/load";
import { getSpaceSettings } from "@/server/services/spaces";
import { listTemplates } from "@/server/services/templates";

/** Settings of one space; only OWNER and ADMIN reach it (anyone else gets 404). */
export default async function SpacePage({
  params,
}: {
  params: Promise<{ spaceId: string }>;
}) {
  const user = await loadUser();
  const { lang, t } = await getT();
  const space = await getSpaceSettings(user.id, (await params).spaceId);
  if (!space) notFound();
  const workspace = await loadWorkspace(user.id, space.workspaceId);
  const templates = await listTemplates(user.id, space.workspaceId, lang);
  const url = `/api/spaces/${space.id}`;

  return (
    <WorkspaceShell workspace={workspace}>
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold">{t.space.title(space.name)}</h1>
        <ApiForm
          method="PATCH"
          url={url}
          submit={t.space.save}
          className="card space-y-3"
        >
          <label className="field">
            {t.space.name}
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={space.name}
              className="input"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              name="isPrivate"
              defaultChecked={space.isPrivate}
            />
            {t.space.privateLabel}
          </label>
        </ApiForm>

        <ApiForm
          method="PATCH"
          url={url}
          submit={t.space.saveDefault}
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">{t.space.defaultTitle}</h2>
          <p className="text-sm text-muted">{t.space.defaultHelp}</p>
          <TemplateSelect
            name="defaultTemplate"
            label={t.space.workflow}
            none={t.space.genericNone}
            templates={templates}
            value={space.defaultTemplate}
          />
        </ApiForm>

        <SpaceAccess spaceId={space.id} people={space.people} />

        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">{t.space.foldersTitle}</h2>
          <p className="text-sm text-muted">{t.space.foldersHelp}</p>
          <ul className="space-y-3">
            {space.folders.map((folder) => (
              <li
                key={folder.id}
                className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
              >
                <ApiForm
                  method="PATCH"
                  url={`/api/folders/${folder.id}`}
                  submit={t.space.rename}
                  className="flex flex-1 flex-wrap items-end gap-2"
                >
                  <label className="field flex-1">
                    {t.space.folderName}
                    <input
                      name="name"
                      required
                      maxLength={80}
                      defaultValue={folder.name}
                      className="input"
                    />
                  </label>
                </ApiForm>
                <ApiForm
                  method="PATCH"
                  url={`/api/folders/${folder.id}`}
                  submit={t.space.saveWorkflow}
                  className="flex flex-wrap items-end gap-2"
                >
                  <TemplateSelect
                    name="defaultTemplate"
                    label={t.space.defaultOf(folder.name)}
                    none={t.space.sameAsSpace}
                    templates={templates}
                    value={folder.defaultTemplate}
                  />
                </ApiForm>
                <ApiForm
                  method="DELETE"
                  url={`/api/folders/${folder.id}`}
                  submit={t.space.deleteNamed(folder.name)}
                  danger
                  confirmText={folder.name}
                  className="flex flex-wrap items-end gap-2"
                />
              </li>
            ))}
          </ul>
          <ApiForm
            method="POST"
            url={`${url}/folders`}
            submit={t.space.addFolder}
            className="space-y-2 border-t border-line pt-3"
          >
            <label className="field">
              {t.space.newFolder}
              <input name="name" required maxLength={80} className="input" />
            </label>
          </ApiForm>
        </section>

        <ApiForm
          method="DELETE"
          url={url}
          redirectTo={`/w/${space.workspaceId}`}
          submit={t.space.deleteSpace}
          danger
          confirmText={space.name}
          className="card-danger space-y-3"
        >
          <h2 className="text-lg font-semibold text-danger-text">
            {t.space.deleteSpace}
          </h2>
          <p className="text-sm text-muted">{t.space.deleteSpaceHint}</p>
        </ApiForm>
      </main>
    </WorkspaceShell>
  );
}
