import Link from "next/link";
import type { ReactNode } from "react";
import { can } from "@/server/policies";
import type { getWorkspace } from "@/server/services/workspaces";

type Workspace = Awaited<ReturnType<typeof getWorkspace>>;
type ListLink = { id: string; name: string };

/**
 * Two columns: the workspace tree (spaces, folders, lists the user can see) and the page. On small
 * screens the tree folds into a native <details> above the page.
 */
export function WorkspaceShell({
  workspace,
  currentListId,
  children,
}: {
  workspace: Workspace;
  currentListId?: string;
  children: ReactNode;
}) {
  const tree = <Tree workspace={workspace} currentListId={currentListId} />;
  return (
    <div className="gap-8 lg:grid lg:grid-cols-[15rem_1fr]">
      <details className="card mb-6 p-3 lg:hidden">
        <summary className="cursor-pointer font-medium">
          {workspace.name}: spaces and lists
        </summary>
        <div className="mt-3">{tree}</div>
      </details>
      <aside className="hidden lg:block">{tree}</aside>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Tree({
  workspace,
  currentListId,
}: {
  workspace: Workspace;
  currentListId?: string;
}) {
  const admin = can(workspace, "structure:manage");
  const link = (list: ListLink) => (
    <li key={list.id}>
      <Link
        href={`/lists/${list.id}`}
        aria-current={list.id === currentListId ? "page" : undefined}
        className="block truncate rounded-md px-2 py-1 text-sm hover:bg-subtle aria-[current=page]:bg-subtle aria-[current=page]:font-semibold"
      >
        {list.name}
      </Link>
    </li>
  );
  return (
    <nav aria-label="Workspace" className="space-y-4 text-sm">
      <div className="space-y-1">
        <Link
          href={`/w/${workspace.id}`}
          className="block truncate font-semibold hover:underline"
        >
          {workspace.name}
        </Link>
        <p className="flex gap-3 text-xs">
          <Link href={`/w/${workspace.id}/settings`} className="link">
            Settings
          </Link>
          <Link href="/workspaces" className="link">
            Switch workspace
          </Link>
        </p>
      </div>
      {workspace.spaces.length === 0 && (
        <p className="text-muted">No spaces you can see yet.</p>
      )}
      {workspace.spaces.map((space) => (
        <div key={space.id} className="space-y-1">
          <p className="flex items-center justify-between gap-2 px-2 text-xs font-semibold tracking-wide text-muted uppercase">
            <span className="truncate">
              {space.name}
              {space.isPrivate && <span className="sr-only"> (private)</span>}
            </span>
            {space.isPrivate && (
              <span aria-hidden="true" className="badge">
                private
              </span>
            )}
          </p>
          <ul>
            {space.folders.map((folder) => (
              <li key={folder.id}>
                <p className="truncate px-2 py-1 text-muted">{folder.name}</p>
                <ul className="ml-3 border-l border-line pl-1">
                  {folder.lists.map(link)}
                  {folder.lists.length === 0 && (
                    <li className="px-2 py-1 text-xs text-muted">Empty</li>
                  )}
                </ul>
              </li>
            ))}
            {space.lists.map(link)}
          </ul>
          {admin && (
            <Link
              href={`/spaces/${space.id}`}
              className="link block px-2 text-xs"
            >
              Manage {space.name}
            </Link>
          )}
        </div>
      ))}
    </nav>
  );
}
