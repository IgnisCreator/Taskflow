import { notFound } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { WorkspaceShell } from "@/components/workspace-shell";
import { ALERT_LIMITS } from "@/lib/alerts";
import { getT } from "@/server/i18n";
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
  const { t } = await getT();
  const list = await getList(user.id, (await params).listId);
  if (!list || !can(list, "structure:manage")) notFound();
  const workspace = await loadWorkspace(user.id, list.workspaceId);
  const url = `/api/lists/${list.id}`;
  const version = { expectedBoardVersion: list.boardVersion };

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <h1 className="text-2xl font-semibold">{t.listSettings.title}</h1>
        <ApiForm
          method="PATCH"
          url={url}
          extra={version}
          submit={t.listSettings.save}
          className="card space-y-3"
        >
          <label className="field">
            {t.listSettings.name}
            <input
              name="name"
              required
              maxLength={80}
              defaultValue={list.name}
              className="input"
            />
          </label>
          <label className="field">
            {t.listSettings.description}
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
          submit={t.listSettings.saveThresholds}
          className="card space-y-3"
        >
          <h2 className="text-lg font-semibold">
            {t.listSettings.alertsTitle}
          </h2>
          <p className="text-sm text-muted">{t.listSettings.alertsHelp}</p>
          <label className="field">
            {t.listSettings.wipDays}
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
            {t.listSettings.bandDays}
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
            {t.listSettings.dropPercent}
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
          submit={t.listSettings.deleteList}
          danger
          confirmText={list.name}
          className="card-danger space-y-3"
        >
          <h2 className="text-lg font-semibold text-danger-text">
            {t.listSettings.deleteList}
          </h2>
          <p className="text-sm text-muted">{t.listSettings.deleteListHint}</p>
        </ApiForm>
      </main>
    </WorkspaceShell>
  );
}
