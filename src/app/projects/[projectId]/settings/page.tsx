import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { DeleteProjectForm } from "@/components/delete-project-form";
import { MembersPanel } from "@/components/members-panel";
import { ProjectDetailsForm } from "@/components/project-details-form";
import { can } from "@/server/policies";
import { listMembers } from "@/server/services/members";
import { getProject } from "@/server/services/projects";
import { getCurrentUser } from "@/server/session";

export default async function SettingsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const { projectId } = await params;
  const project = await getProject(user.id, projectId);
  if (!project) notFound();
  const members = await listMembers(user.id, projectId);

  return (
    <main>
      <p>
        <Link href={`/projects/${projectId}`}>Back to {project.name}</Link>
      </p>
      <h1>Settings</h1>
      {can(project, "project:edit") ? (
        <ProjectDetailsForm
          projectId={projectId}
          boardVersion={project.boardVersion}
          name={project.name}
          description={project.description}
        />
      ) : (
        <p>Only an admin can edit the project details.</p>
      )}
      <MembersPanel
        projectId={projectId}
        boardVersion={project.boardVersion}
        members={members}
        actor={{ role: project.role, isOwner: project.isOwner }}
      />
      {can(project, "project:delete") && (
        <DeleteProjectForm
          projectId={projectId}
          boardVersion={project.boardVersion}
          name={project.name}
        />
      )}
    </main>
  );
}
