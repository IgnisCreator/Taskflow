import Link from "next/link";

export default function HomePage() {
  return (
    <main>
      <h1>TaskFlow</h1>
      <p>Collaborative Kanban project manager.</p>
      <p>
        <Link href="/projects">Projects</Link> ·{" "}
        <Link href="/profile">Profile</Link>
      </p>
    </main>
  );
}
