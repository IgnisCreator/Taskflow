import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { FlowEditor, type TemplateOption } from "@/components/flow-editor";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getT } from "@/server/i18n";
import { loadUser, loadWorkspace } from "@/server/load";
import { getFlow } from "@/server/services/flow";
import { listTemplates } from "@/server/services/templates";

/** The workflow of one list; only OWNER and ADMIN reach it (anyone else gets 404). */
export default async function FlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const user = await loadUser();
  const { lang, t } = await getT();
  const flow = await getFlow(user.id, (await params).listId);
  if (!flow) notFound();
  const { list, stages } = flow;
  const [workspace, templates] = await Promise.all([
    loadWorkspace(user.id, list.workspaceId),
    listTemplates(user.id, list.workspaceId, lang),
  ]);
  const options: TemplateOption[] = [
    ...templates.system.map(({ ref, name, stages }) => ({
      ref,
      name,
      stages,
      group: "system" as const,
    })),
    ...templates.organisation.map(({ ref, name, stages }) => ({
      ref,
      name,
      stages,
      group: "workspace" as const,
    })),
  ];

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <p className="text-sm">
          <Link href={`/lists/${list.id}/settings`} className="link">
            &larr; {t.listPage.settings}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">{t.flow.title(list.name)}</h1>
        {/* The version in the key resets the editor after every save or refresh. */}
        <FlowEditor
          key={list.boardVersion}
          listId={list.id}
          version={list.boardVersion}
          stages={stages}
          templates={options}
          saved={(await searchParams).saved === "1"}
        />
        <ApiForm
          method="POST"
          url={`/api/workspaces/${list.workspaceId}/templates`}
          extra={{ fromListId: list.id }}
          submit={t.flow.saveAsTemplate}
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">{t.flow.saveTemplateTitle}</h2>
          <p className="text-sm text-muted">{t.flow.saveTemplateHelp}</p>
          <label className="field">
            {t.flow.templateName}
            <input name="name" required maxLength={60} className="input" />
          </label>
        </ApiForm>
      </main>
    </WorkspaceShell>
  );
}
