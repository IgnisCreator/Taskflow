import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateProjectForm } from "@/components/create-project-form";
import { listProjects } from "@/server/services/projects";
import { getCurrentUser } from "@/server/session";

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { items } = await listProjects(user.id, { limit: 50 });

  return (
    <main className="space-y-8">
      <h1 className="text-2xl font-semibold">Projects</h1>
      {items.length === 0 ? (
        <p className="card text-muted">
          You have no projects yet. Create the first one below.
        </p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {items.map((project) => (
            <li key={project.id}>
              <Link
                href={`/projects/${project.id}`}
                className="card block hover:border-primary"
              >
                <span className="flex items-center justify-between gap-2">
                  <span className="font-medium">{project.name}</span>
                  <span className="badge">
                    {project.isOwner ? "owner" : project.role}
                  </span>
                </span>
                {project.description && (
                  <span className="mt-1 line-clamp-2 block text-sm text-muted">
                    {project.description}
                  </span>
                )}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <CreateProjectForm />
    </main>
  );
}
