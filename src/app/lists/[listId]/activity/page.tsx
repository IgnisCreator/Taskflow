import Link from "next/link";
import { notFound } from "next/navigation";
import { WorkspaceShell } from "@/components/workspace-shell";
import { describeEvent } from "@/lib/events";
import { loadUser, loadWorkspace } from "@/server/load";
import { getList } from "@/server/services/lists";
import { listActivity } from "@/server/services/details";

const PAGE = 50;

/** What happened on the list, newest first. Anyone who can see the list can read it. */
export default async function ActivityPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{ after?: string }>;
}) {
  const user = await loadUser();
  const { listId } = await params;
  const { after } = await searchParams;
  const list = await getList(user.id, listId);
  if (!list) notFound();
  const [workspace, activity] = await Promise.all([
    loadWorkspace(user.id, list.workspaceId),
    listActivity(user.id, listId, { limit: PAGE, cursor: after }),
  ]);

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <p className="text-sm">
          <Link href={`/lists/${list.id}`} className="link">
            &larr; {list.name}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">Activity of {list.name}</h1>
        {activity.items.length === 0 && (
          <p className="card text-muted">Nothing has happened here yet.</p>
        )}
        <ul className="space-y-2">
          {activity.items.map((event) => (
            <li key={event.id} className="card space-y-1 p-3 text-sm">
              <p className="font-medium">{event.task.title}</p>
              <p>
                {describeEvent(event)}
                <span className="ml-2 text-muted">
                  {event.at.toLocaleString("en-GB", {
                    dateStyle: "medium",
                    timeStyle: "short",
                    timeZone: "UTC",
                  })}{" "}
                  UTC
                </span>
              </p>
            </li>
          ))}
        </ul>
        {activity.nextCursor && (
          <Link
            href={`/lists/${list.id}/activity?after=${activity.nextCursor}`}
            className="btn-secondary"
          >
            Older activity
          </Link>
        )}
      </main>
    </WorkspaceShell>
  );
}
