import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { leaveDemo, restartDemo } from "@/app/demo-actions";
import { getCurrentUser } from "@/server/session";
import { getT } from "@/server/i18n";
import { unreadCount } from "@/server/services/notifications";
import { LangProvider } from "@/components/lang-provider";
import { LangToggle } from "@/components/lang-toggle";
import { ThemeToggle, type Theme } from "@/components/theme-toggle";
import { formatDateTime } from "@/lib/i18n";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getT();
  return { title: "TaskFlow", description: t.meta.description };
}

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const saved = (await cookies()).get("theme")?.value;
  const theme: Theme = saved === "light" || saved === "dark" ? saved : "auto";
  const { lang, t } = await getT();

  return (
    <html lang={lang} data-theme={theme === "auto" ? undefined : theme}>
      <body className="min-h-screen bg-page text-fg antialiased">
        <LangProvider lang={lang}>
          <a
            href="#content"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
          >
            {t.nav.skip}
          </a>
          <header className="sticky top-0 z-10 border-b border-line bg-surface">
            <nav
              aria-label={t.nav.main}
              className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:gap-x-6"
            >
              <Link href="/" className="text-base font-semibold text-link">
                TaskFlow
              </Link>
              {user ? (
                <>
                  <Link href="/workspaces" className="text-muted hover:text-fg">
                    {t.nav.workspaces}
                  </Link>
                  <Link
                    href="/notifications"
                    className="text-muted hover:text-fg"
                  >
                    {t.nav.notifications}
                    {unread > 0 && (
                      <span
                        className="badge ml-1"
                        aria-label={t.nav.unread(unread)}
                      >
                        {unread}
                      </span>
                    )}
                  </Link>
                  <Link href="/profile" className="text-muted hover:text-fg">
                    {t.nav.profile}
                  </Link>
                </>
              ) : (
                <Link href="/login" className="text-muted hover:text-fg">
                  {t.nav.signIn}
                </Link>
              )}
              <span className="ml-auto flex items-center gap-2">
                <LangToggle />
                <ThemeToggle initial={theme} />
              </span>
            </nav>
          </header>
          {user?.sandboxUntil && (
            <div
              role="note"
              className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-line bg-subtle px-4 py-2 text-center text-sm"
            >
              <span>
                {t.demo.banner(formatDateTime(user.sandboxUntil, lang))}
              </span>
              <form action={restartDemo}>
                <button type="submit" className="link">
                  {t.demo.restart}
                </button>
              </form>
              <form action={leaveDemo}>
                <button type="submit" className="link">
                  {t.demo.leave}
                </button>
              </form>
            </div>
          )}
          <div id="content" className="mx-auto max-w-[90rem] px-4 py-6">
            {children}
          </div>
        </LangProvider>
      </body>
    </html>
  );
}
