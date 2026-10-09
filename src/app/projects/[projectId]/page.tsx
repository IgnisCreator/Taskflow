import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getProject } from "@/server/services/projects";
import { getCurrentUser } from "@/server/session";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const project = await getProject(user.id, (await params).projectId);
  if (!project) notFound();

  return (
    <main className="space-y-6">
      <p className="text-sm">
        <Link href="/projects" className="link">
          &larr; All projects
        </Link>
      </p>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 text-muted">{project.description}</p>
          )}
        </div>
        <span className="badge">
          {project.isOwner ? "owner" : project.role}
        </span>
      </div>
      <p>
        <Link
          href={`/projects/${project.id}/settings`}
          className="btn-secondary"
        >
          Settings and members
        </Link>
      </p>
      <p className="card text-muted">The board arrives in a later milestone.</p>
    </main>
  );
}
