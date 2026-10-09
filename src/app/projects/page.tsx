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
    <main>
      <h1>Projects</h1>
      {items.length === 0 ? (
        <p>You have no projects yet. Create the first one below.</p>
      ) : (
        <ul>
          {items.map((project) => (
            <li key={project.id}>
              <Link href={`/projects/${project.id}`}>{project.name}</Link>{" "}
              <small>({project.isOwner ? "owner" : project.role})</small>
            </li>
          ))}
        </ul>
      )}
      <CreateProjectForm />
    </main>
  );
}
