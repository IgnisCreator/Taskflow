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
    <main>
      <p>
        <Link href="/projects">All projects</Link>
      </p>
      <h1>{project.name}</h1>
      {project.description && <p>{project.description}</p>}
      <p>Your role: {project.isOwner ? "owner" : project.role}</p>
      <p>
        <Link href={`/projects/${project.id}/settings`}>
          Settings and members
        </Link>
      </p>
      <p>The board arrives in a later milestone.</p>
    </main>
  );
}
