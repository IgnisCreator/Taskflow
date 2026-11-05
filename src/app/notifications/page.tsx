import Link from "next/link";
import { ApiForm } from "@/components/api-form";
import { notificationText } from "@/lib/alerts";
import { formatDateTime } from "@/lib/i18n";
import { getT } from "@/server/i18n";
import { loadUser } from "@/server/load";
import { listNotifications } from "@/server/services/notifications";

/** The alerts of the daily job that concern the user: open ones first, then the last that stopped holding. */
export default async function NotificationsPage() {
  const user = await loadUser();
  const { lang, t } = await getT();
  const when = (date: Date) => `${formatDateTime(date, lang)} UTC`;
  const { open, resolved } = await listNotifications(user.id);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">{t.notifications.title}</h1>
        {open.some((n) => !n.readAt) && (
          <ApiForm
            method="POST"
            url="/api/notifications/read"
            submit={t.notifications.markAll}
            className="inline"
          />
        )}
      </div>
      <p className="text-sm text-muted">{t.notifications.intro}</p>
      {open.length === 0 && (
        <p className="card text-muted">{t.notifications.none}</p>
      )}
      <ul className="space-y-3">
        {open.map((n) => (
          <li
            key={n.id}
            className={`card space-y-2 ${n.readAt ? "" : "border-primary"}`}
          >
            <p className={n.readAt ? "" : "font-semibold"}>
              {notificationText(n, lang)}
            </p>
            <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <Link href={`/lists/${n.listId}/metrics`} className="link">
                {t.notifications.seeMetrics(n.listName)}
              </Link>
              <span>{when(n.createdAt)}</span>
              {n.readAt ? (
                <span>{t.notifications.read}</span>
              ) : (
                <ApiForm
                  method="POST"
                  url="/api/notifications/read"
                  extra={{ id: n.id }}
                  submit={t.notifications.markOne}
                  className="inline"
                />
              )}
            </p>
          </li>
        ))}
      </ul>
      {resolved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">{t.notifications.resolved}</h2>
          <ul className="space-y-2 text-sm text-muted">
            {resolved.map((n) => (
              <li key={n.id} className="card p-3">
                {n.listName}: {notificationText(n, lang)}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
