import Link from "next/link";
import { startDemo } from "@/app/demo-actions";
import { githubLogin } from "@/lib/env";
import { getT } from "@/server/i18n";
import { demoEnabled } from "@/server/services/demo";
import { getCurrentUser } from "@/server/session";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ demo?: string }>;
}) {
  const demo = (await searchParams).demo;
  const limited = demo === "limit";
  const busy = demo === "busy";
  const user = await getCurrentUser();
  const { t } = await getT();
  const l = t.landing;
  const cta = user
    ? { href: "/workspaces", label: l.goToWorkspaces }
    : {
        href: "/login",
        label: githubLogin() ? l.signInGithub : l.signIn,
      };

  return (
    <main className="space-y-20">
      <section className="space-y-6 py-6 text-center sm:py-12">
        <p className="badge normal-case">{l.badge}</p>
        <h1 className="mx-auto max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          {l.title}
        </h1>
        <p className="mx-auto max-w-xl text-lg text-muted">{l.intro}</p>
        <p className="flex flex-wrap justify-center gap-3">
          <Link href={cta.href} className="btn px-5 py-3 text-base">
            {cta.label}
          </Link>
          {limited && (
            <span role="alert" className="error w-full">
              {t.demo.limit}
            </span>
          )}
          {busy && (
            <span role="alert" className="error w-full">
              {t.demo.busy}
            </span>
          )}
          {!user && demoEnabled() && (
            <form action={startDemo}>
              <button
                type="submit"
                className="btn-secondary px-5 py-3 text-base"
              >
                {t.demo.explore}
              </button>
            </form>
          )}
          <a href="#kanban" className="btn-secondary px-5 py-3 text-base">
            {l.whatIsKanban}
          </a>
        </p>
        {!user && demoEnabled() && (
          <p className="text-sm text-muted">{t.demo.caption}</p>
        )}
      </section>

      <section id="kanban" className="scroll-mt-8 space-y-8">
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold">{l.whatIsKanban}</h2>
          <p className="max-w-2xl text-muted">{l.kanbanText}</p>
        </div>

        <div
          role="img"
          aria-label={l.exampleLabel}
          className="grid gap-3 sm:grid-cols-3"
        >
          {l.exampleColumns.map((column) => (
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
          {l.principles.map((item, index) => (
            <li key={item.title} className="card space-y-2">
              <span className="badge">{l.step(index + 1)}</span>
              <h3 className="font-semibold">{item.title}</h3>
              <p className="text-sm text-muted">{item.text}</p>
            </li>
          ))}
        </ol>
        <p className="text-sm text-muted">{l.note}</p>
      </section>

      <section className="space-y-6">
        <h2 className="text-2xl font-semibold">{l.doesTitle}</h2>
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {l.features.map((feature) => (
            <li key={feature.title} className="card space-y-2">
              <h3 className="font-semibold">{feature.title}</h3>
              <p className="text-sm text-muted">{feature.text}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="card space-y-4 text-center">
        <h2 className="text-2xl font-semibold">{l.readyTitle}</h2>
        <p className="text-muted">{l.readyText}</p>
        <p>
          <Link href={cta.href} className="btn px-5 py-3 text-base">
            {cta.label}
          </Link>
        </p>
      </section>
    </main>
  );
}
