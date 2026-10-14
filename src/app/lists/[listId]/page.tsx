import Link from "next/link";
import type { ComponentProps } from "react";
import { notFound } from "next/navigation";
import { Board } from "@/components/board";
import { TaskFilters } from "@/components/task-filters";
import { TaskTable } from "@/components/task-table";
import { WorkspaceShell } from "@/components/workspace-shell";
import { VIEWS, parseView } from "@/lib/list-view";
import { messages } from "@/lib/messages";
import { roleLabel } from "@/lib/roles";
import { isFiltered, parseFilter } from "@/lib/validations/filters";
import { ApiError } from "@/server/http";
import { loadUser, loadWorkspace } from "@/server/load";
import { can } from "@/server/policies";
import { listCatalog } from "@/server/services/catalog";
import { getBoard } from "@/server/services/tasks";

export default async function ListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await loadUser();
  const query = await searchParams;
  const filter = parseFilter(query);
  const { view, sort, dir } = parseView(query);
  // The URL as it is, minus what a link changes: view tabs keep filters and sort, sort links keep filters and view.
  const without = (...keys: string[]) => {
    const kept = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (typeof value === "string" && !keys.includes(key))
        kept.set(key, value);
    }
    return kept.toString();
  };
  const board = await getBoard(user.id, (await params).listId, filter).catch(
    (error) => {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    },
  );
  const { list } = board;
  const [workspace, catalog] = await Promise.all([
    loadWorkspace(user.id, list.workspaceId),
    listCatalog(user.id, list.workspaceId),
  ]);

  return (
    <WorkspaceShell workspace={workspace} currentListId={list.id}>
      <main className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">{list.name}</h1>
            {list.description && (
              <p className="mt-1 text-muted">{list.description}</p>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge normal-case">
              {roleLabel(workspace.roleLabels, list.role)}
            </span>
            <Link href={`/lists/${list.id}/metrics`} className="btn-secondary">
              Metrics
            </Link>
            <Link href={`/lists/${list.id}/forecast`} className="btn-secondary">
              Forecast
            </Link>
            <Link href={`/lists/${list.id}/activity`} className="btn-secondary">
              Activity
            </Link>
            {can(list, "structure:manage") && (
              <>
                <Link href={`/lists/${list.id}/flow`} className="btn-secondary">
                  Workflow
                </Link>
                <Link
                  href={`/lists/${list.id}/settings`}
                  className="btn-secondary"
                >
                  List settings
                </Link>
              </>
            )}
          </div>
        </div>
        <nav aria-label={messages.views.label} className="flex gap-2">
          {VIEWS.map((v) => (
            <Link
              key={v}
              href={`?${without("view")}${without("view") ? "&" : ""}view=${v}`}
              aria-current={v === view ? "page" : undefined}
              className={v === view ? "btn" : "btn-secondary"}
            >
              {messages.views[v]}
            </Link>
          ))}
        </nav>
        <TaskFilters
          filter={filter}
          members={board.members}
          catalog={catalog}
          view={view}
          sort={sort}
          dir={dir}
        />
        <Body
          view={view}
          boardProps={{
            filtered: isFiltered(filter),
            listId: list.id,
            boardVersion: list.boardVersion,
            canWrite: can(list, "task:write"),
            members: board.members.map(({ userId, name }) => ({
              userId,
              name,
            })),
            catalog,
            viewerId: user.id,
            canModerate: can(list, "structure:manage"),
            columns: board.columns.map((column) => ({
              id: column.id,
              name: column.name,
              total: column.total,
              wipLimit: column.wipLimit,
              policy: column.policy,
              tasks: column.tasks.map((task) => ({
                id: task.id,
                columnId: task.columnId,
                title: task.title,
                description: task.description,
                priority: task.priority,
                dueDate: task.dueDate,
                assigneeIds: task.assigneeIds,
                type: task.type,
                labels: task.labels,
                blockedReason: task.blockedReason,
                subtasks: task.subtasks,
              })),
            })),
          }}
          tableProps={{ sort, dir, query: without("sort", "dir") }}
        />
      </main>
    </WorkspaceShell>
  );
}

/** The board or the table, built from the same data. */
function Body({
  view,
  boardProps,
  tableProps,
}: {
  view: "board" | "list";
  boardProps: ComponentProps<typeof Board>;
  tableProps: Pick<ComponentProps<typeof TaskTable>, "sort" | "dir" | "query">;
}) {
  return view === "list" ? (
    <TaskTable {...boardProps} {...tableProps} />
  ) : (
    <Board {...boardProps} />
  );
}
