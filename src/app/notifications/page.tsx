import Link from "next/link";
import { ApiForm } from "@/components/api-form";
import { loadUser } from "@/server/load";
import { listNotifications } from "@/server/services/notifications";

const when = (date: Date) =>
  date.toLocaleString("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  }) + " UTC";

/** The alerts of the daily job that concern the user: open ones first, then the last that stopped holding. */
export default async function NotificationsPage() {
  const user = await loadUser();
  const { open, resolved } = await listNotifications(user.id);

  return (
    <main className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Notifications</h1>
        {!user.isDemo && open.some((n) => !n.readAt) && (
          <ApiForm
            method="POST"
            url="/api/notifications/read"
            submit="Mark all as read"
            className="inline"
          />
        )}
      </div>
      <p className="text-sm text-muted">
        Once a day TaskFlow checks every list for early signs of a bottleneck.
        An alert stays here while the problem holds and moves to Resolved when
        it stops.
      </p>
      {open.length === 0 && (
        <p className="card text-muted">No open alerts. Flow looks healthy.</p>
      )}
      <ul className="space-y-3">
        {open.map((n) => (
          <li
            key={n.id}
            className={`card space-y-2 ${n.readAt ? "" : "border-primary"}`}
          >
            <p className={n.readAt ? "" : "font-semibold"}>{n.message}</p>
            <p className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <Link href={`/lists/${n.listId}/metrics`} className="link">
                {n.listName}: see the metrics
              </Link>
              <span>{when(n.createdAt)}</span>
              {n.readAt ? (
                <span>Read</span>
              ) : user.isDemo ? null : (
                <ApiForm
                  method="POST"
                  url="/api/notifications/read"
                  extra={{ id: n.id }}
                  submit="Mark as read"
                  className="inline"
                />
              )}
            </p>
          </li>
        ))}
      </ul>
      {resolved.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-lg font-semibold">Resolved</h2>
          <ul className="space-y-2 text-sm text-muted">
            {resolved.map((n) => (
              <li key={n.id} className="card p-3">
                {n.listName}: {n.message}
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}
