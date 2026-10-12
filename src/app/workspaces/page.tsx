import Link from "next/link";
import { redirect } from "next/navigation";
import { ApiForm } from "@/components/api-form";
import { roleLabel } from "@/lib/roles";
import { listWorkspaces } from "@/server/services/workspaces";
import { getCurrentUser } from "@/server/session";

export default async function WorkspacesPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const workspaces = await listWorkspaces(user.id);

  return (
    <main className="mx-auto max-w-2xl space-y-8">
      <h1 className="text-2xl font-semibold">Workspaces</h1>
      {workspaces.length === 0 ? (
        <p className="card text-muted">
          You are not in any workspace yet. Create one below, or ask an admin to
          add you with the email you sign in with.
        </p>
      ) : (
        <ul className="grid gap-3">
          {workspaces.map((workspace) => (
            <li key={workspace.id}>
              <Link
                href={`/w/${workspace.id}`}
                className="card flex items-center justify-between gap-2 hover:border-primary"
              >
                <span className="font-medium">{workspace.name}</span>
                <span className="badge normal-case">
                  {roleLabel({}, workspace.role)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <ApiForm
        method="POST"
        url="/api/workspaces"
        redirectTo="/w/{id}"
        submit="Create workspace"
        className="card space-y-4"
      >
        <h2 className="text-lg font-semibold">New workspace</h2>
        <p className="text-sm text-muted">
          You will be its owner. It starts with one public space, General.
        </p>
        <label className="field">
          Name
          <input name="name" required maxLength={80} className="input" />
        </label>
      </ApiForm>
    </main>
  );
}
