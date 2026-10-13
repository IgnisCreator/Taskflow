import { notFound } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ALERT_LIMITS } from "@/lib/alerts";
import { loadUser, loadWorkspace } from "@/server/load";
import { can } from "@/server/policies";
import { getList } from "@/server/services/lists";

/** Name, description and deletion of a list; only for OWNER and ADMIN. */
export default async function ListSettingsPage({
  params,
}: {
  params: Promise<{ listId: string }>;
}) {
  const user = await loadUser();
  const list = await getList(user.id, (await params).listId);
  if (!list || !can(list, "structure:manage")) notFound();
  const workspace = await loadWorkspace(user.id, list.workspaceId);
  const url = `/api/lists/${list.id}`;
  const version = { expectedBoardVersion: list.boardVersion };

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold">List settings</h1>
        <ApiForm
          method="PATCH"
          url={url}
          extra={version}
          submit="Save"
          className="card space-y-3"
        >
          <label className="field">
            Name
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={list.name}
              className="input"
            />
          </label>
          <label className="field">
            Description (optional)
            <textarea
              name="description"
              maxLength={5000}
              rows={3}
              defaultValue={list.description ?? ""}
              className="input"
            />
          </label>
        </ApiForm>
        <ApiForm
          method="PATCH"
          url={url}
          extra={version}
          submit="Save alert thresholds"
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">Alerts</h2>
          <p className="text-sm text-muted">
            Once a day TaskFlow checks this list and notifies the admins (stage
            alerts) or the assignees (a task that is too old).
          </p>
          <label className="field">
            Days over a stage&apos;s WIP limit before alerting
            <input
              name="alertWipDays"
              type="number"
              required
              min={ALERT_LIMITS.days.min}
              max={ALERT_LIMITS.days.max}
              defaultValue={list.alertWipDays}
              className="input"
            />
          </label>
          <label className="field">
            Days a stage must keep growing before alerting
            <input
              name="alertBandDays"
              type="number"
              required
              min={ALERT_LIMITS.days.min}
              max={ALERT_LIMITS.days.max}
              defaultValue={list.alertBandDays}
              className="input"
            />
          </label>
          <label className="field">
            Weekly throughput drop (%) before alerting
            <input
              name="alertDropPercent"
              type="number"
              required
              min={ALERT_LIMITS.dropPercent.min}
              max={ALERT_LIMITS.dropPercent.max}
              defaultValue={list.alertDropPercent}
              className="input"
            />
          </label>
        </ApiForm>
        <ApiForm
          method="DELETE"
          url={url}
          extra={version}
          redirectTo={`/w/${list.workspaceId}`}
          submit="Delete list"
          danger
          confirmText={list.name}
          className="card-danger space-y-3"
        >
          <h2 className="text-lg font-semibold text-danger-text">
            Delete list
          </h2>
          <p className="text-sm text-muted">
            This permanently deletes the board and its tasks.
          </p>
        </ApiForm>
      </main>
    </WorkspaceShell>
  );
}
