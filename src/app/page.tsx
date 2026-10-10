import Link from "next/link";
import { getCurrentUser } from "@/server/session";

const FEATURES = [
  {
    title: "Shared boards",
    text: "Invite up to five people to a project. Everyone sees the same board and changes show up within seconds.",
  },
  {
    title: "Roles that make sense",
    text: "Admins manage the team, members move and edit tasks, viewers only read. The server enforces it, not just the buttons.",
  },
  {
    title: "Drag, or use the keyboard",
    text: "Drag cards between columns, or pick a column and position from the task dialog. Both work with a keyboard.",
  },
  {
    title: "Find things fast",
    text: "Search by title or description and filter by assignee or priority. Filters live in the URL, so you can share them.",
  },
  {
    title: "No lost edits",
    text: "If two people change the board at once, nobody is overwritten silently: you are told and your text is kept.",
  },
  {
    title: "Light and dark",
    text: "Follows your system theme, or pick one from the header.",
  },
];

const PRINCIPLES = [
  {
    title: "Make the work visible",
    text: "Every task is a card on a board, so nothing hides in someone's head or inbox.",
  },
  {
    title: "Limit what is in progress",
    text: "Fewer things started at once means more things actually finished. Kanban teams cap each column.",
  },
  {
    title: "Watch the flow",
    text: "Cards move left to right. Where they pile up is where the process is stuck.",
  },
];

const EXAMPLE = [
  { name: "To do", cards: ["Write the report", "Book the venue"] },
  { name: "In progress", cards: ["Design the poster"] },
  { name: "Done", cards: ["Pick a date", "Invite the team"] },
];

export default async function HomePage() {
  const user = await getCurrentUser();
  const cta = user
    ? { href: "/projects", label: "Go to your projects" }
    : { href: "/login", label: "Sign in with GitHub" };

  return (
    <main className="space-y-20">
      <section className="space-y-6 py-6 text-center sm:py-12">
        <p className="badge normal-case">Kanban for small teams</p>
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          See what your team is working on, at a glance
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted">
          TaskFlow is a Kanban board for small teams. Create a project, add
          tasks, and move them from idea to done together.
        </p>
        <p className="flex flex-wrap justify-center gap-3">
          <Link href={cta.href} className="btn px-5 py-3 text-base">
            {cta.label}
          </Link>
          <a href="#kanban" className="btn-secondary px-5 py-3 text-base">
            What is Kanban?
          </a>
        </p>
      </section>

      <section id="kanban" className="scroll-mt-8 space-y-8">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">What is Kanban?</h2>
          <p className="max-w-2xl text-muted">
            Kanban (Japanese for &ldquo;signboard&rdquo;) is a way to manage
            work with a board. It started in Toyota factories in the 1940s and
            1950s, where cards told each station what to make next, and software
            teams adopted it later. The board has columns for the stages of your
            work; each task is a card that moves through them.
          </p>
        </div>

        <div
          role="img"
          aria-label="Example board: To do has two cards, In progress has one, Done has two."
          className="grid gap-3 sm:grid-cols-3"
        >
          {EXAMPLE.map((column) => (
            <div
              key={column.name}
              aria-hidden="true"
              className="space-y-2 rounded-lg border border-line bg-subtle p-3"
            >
              <p className="flex items-center justify-between text-sm font-semibold">
                {column.name}
                <span className="badge">{column.cards.length}</span>
              </p>
              {column.cards.map((card) => (
                <p
                  key={card}
                  className="card p-3 text-sm font-medium shadow-none"
                >
                  {card}
                </p>
              ))}
            </div>
          ))}
        </div>

        <ol className="grid gap-4 sm:grid-cols-3">
          {PRINCIPLES.map((item, index) => (
            <li key={item.title} className="card space-y-2">
              <span className="badge">Step {index + 1}</span>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-muted">{item.text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">
          TaskFlow gives you the board, the cards and the flow. It does not
          enforce limits per column yet; that part is up to the team.
        </p>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">What TaskFlow does</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => (
            <li key={feature.title} className="card space-y-2">
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted">{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-4 text-center">
        <h2 className="text-2xl font-semibold">Ready to try it?</h2>
        <p className="text-muted">
          Sign in with GitHub, create a project, and your board is ready with
          four columns.
        </p>
        <p>
          <Link href={cta.href} className="btn px-5 py-3 text-base">
            {cta.label}
          </Link>
        </p>
      </section>
    </main>
  );
}
