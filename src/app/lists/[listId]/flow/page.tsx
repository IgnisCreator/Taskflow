import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { FlowEditor, type TemplateOption } from "@/components/flow-editor";
import { WorkspaceShell } from "@/components/workspace-shell";
import { loadUser, loadWorkspace } from "@/server/load";
import { getFlow } from "@/server/services/flow";
import { listTemplates } from "@/server/services/templates";

/** The workflow of one list; only OWNER and ADMIN reach it (anyone else gets 404). */
export default async function FlowPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const user = await loadUser();
  const flow = await getFlow(user.id, (await params).listId);
  if (!flow) notFound();
  const { list, stages } = flow;
  const [workspace, templates] = await Promise.all([
    loadWorkspace(user.id, list.workspaceId),
    listTemplates(user.id, list.workspaceId),
  ]);
  const options: TemplateOption[] = [
    ...templates.system.map(({ ref, name, stages }) => ({
      ref,
      name,
      stages,
      group: "System" as const,
    })),
    ...templates.organisation.map(({ ref, name, stages }) => ({
      ref,
      name,
      stages,
      group: "Your workspace" as const,
    })),
  ];

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <p className="text-sm">
          <Link href={`/lists/${list.id}/settings`} className="link">
            &larr; List settings
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Workflow of {list.name}</h1>
        {/* The version in the key resets the editor after every save or refresh. */}
        <FlowEditor
          key={list.boardVersion}
          listId={list.id}
          version={list.boardVersion}
          stages={stages}
          templates={options}
        />
        <ApiForm
          method="POST"
          url={`/api/workspaces/${list.workspaceId}/templates`}
          extra={{ fromListId: list.id }}
          submit="Save as template"
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">
            Save this flow as a template
          </h2>
          <p className="text-sm text-muted">
            Saves the flow as it is stored now (save your changes first). Anyone
            in the workspace can then start a list from it.
          </p>
          <label className="field">
            Template name
            <input name="name" required maxLength={60} className="input" />
          </label>
        </ApiForm>
      </main>
    </WorkspaceShell>
  );
}
