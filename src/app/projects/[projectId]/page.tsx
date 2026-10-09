import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Board } from "@/components/board";
import { ApiError } from "@/server/http";
import { can } from "@/server/policies";
import { getBoard } from "@/server/services/tasks";
import { getCurrentUser } from "@/server/session";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const board = await getBoard(user.id, (await params).projectId).catch(
    (error) => {
      if (error instanceof ApiError && error.status === 404) notFound();
      throw error;
    },
  );
  const { project } = board;

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
        <div className="flex items-center gap-2">
          <span className="badge">
            {project.isOwner ? "owner" : project.role}
          </span>
          <Link
            href={`/projects/${project.id}/settings`}
            className="btn-secondary"
          >
            Settings and members
          </Link>
        </div>
      </div>
      <Board
        projectId={project.id}
        boardVersion={project.boardVersion}
        canWrite={can(project, "task:write")}
        members={board.members.map(({ userId, name }) => ({ userId, name }))}
        columns={board.columns.map((column) => ({
          id: column.id,
          name: column.name,
          tasks: column.tasks.map((task) => ({
            id: task.id,
            columnId: task.columnId,
            title: task.title,
            description: task.description,
            priority: task.priority,
            assigneeId: task.assigneeId,
            dueDate: task.dueDate,
          })),
        }))}
      />
    </main>
  );
}
