import { notFound } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { SpaceAccess } from "@/components/space-access";
import { TemplateSelect } from "@/components/template-select";
import { WorkspaceShell } from "@/components/workspace-shell";
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
  const space = await getSpaceSettings(user.id, (await params).spaceId);
  if (!space) notFound();
  const workspace = await loadWorkspace(user.id, space.workspaceId);
  const templates = await listTemplates(user.id, space.workspaceId);
  const url = `/api/spaces/${space.id}`;

  return (
    <WorkspaceShell workspace={workspace}>
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold">Space: {space.name}</h1>
        <ApiForm
          method="PATCH"
          url={url}
          submit="Save"
          className="card space-y-3"
        >
          <label className="field">
            Name
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
            Private: only admins and the people listed below can see it
          </label>
        </ApiForm>

        <ApiForm
          method="PATCH"
          url={url}
          submit="Save default workflow"
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">Default workflow</h2>
          <p className="text-sm text-muted">
            New lists in this space start with this flow, unless their folder
            has its own default or you pick another one when creating them.
          </p>
          <TemplateSelect
            name="defaultTemplate"
            label="Workflow"
            none="Generic: to do, in progress, done, discarded"
            templates={templates}
            value={space.defaultTemplate}
          />
        </ApiForm>

        <SpaceAccess spaceId={space.id} people={space.people} />

        <section className="card space-y-3">
          <h2 className="text-lg font-semibold">Folders</h2>
          <p className="text-sm text-muted">
            Folders are optional: they group lists inside the space.
          </p>
          <ul className="space-y-3">
            {space.folders.map((folder) => (
              <li
                key={folder.id}
                className="flex flex-wrap items-end gap-2 border-t border-line pt-3"
              >
                <ApiForm
                  method="PATCH"
                  url={`/api/folders/${folder.id}`}
                  submit="Rename"
                  className="flex flex-1 flex-wrap items-end gap-2"
                >
                  <label className="field flex-1">
                    Folder name
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
                  submit="Save workflow"
                  className="flex flex-wrap items-end gap-2"
                >
                  <TemplateSelect
                    name="defaultTemplate"
                    label={`Default workflow of ${folder.name}`}
                    none="Same as the space"
                    templates={templates}
                    value={folder.defaultTemplate}
                  />
                </ApiForm>
                <ApiForm
                  method="DELETE"
                  url={`/api/folders/${folder.id}`}
                  submit={`Delete ${folder.name}`}
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
            submit="Add folder"
            className="space-y-2 border-t border-line pt-3"
          >
            <label className="field">
              New folder
              <input name="name" required maxLength={80} className="input" />
            </label>
          </ApiForm>
        </section>

        <ApiForm
          method="DELETE"
          url={url}
          redirectTo={`/w/${space.workspaceId}`}
          submit="Delete space"
          danger
          confirmText={space.name}
          className="card-danger space-y-3"
        >
          <h2 className="text-lg font-semibold text-danger-text">
            Delete space
          </h2>
          <p className="text-sm text-muted">
            This permanently deletes its folders, lists and tasks.
          </p>
        </ApiForm>
      </main>
    </WorkspaceShell>
  );
}
