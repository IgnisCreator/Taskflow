import Link from "next/link";

export default function NotFound() {
  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-semibold">Not found</h1>
      <p className="text-slate-600">
        This page does not exist, or you do not have access to it.
      </p>
      <Link href="/projects" className="btn-secondary">
        Back to projects
      </Link>
    </main>
  );
}
