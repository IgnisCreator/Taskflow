import Link from "next/link";

export default function HomePage() {
  return (
    <main className="space-y-4">
      <h1 className="text-3xl font-bold tracking-tight">TaskFlow</h1>
      <p className="text-muted">
        A collaborative Kanban project manager for small teams.
      </p>
      <p>
        <Link href="/projects" className="btn">
          Go to your projects
        </Link>
      </p>
    </main>
  );
}
