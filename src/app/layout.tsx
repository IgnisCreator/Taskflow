import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { leaveDemo, restartDemo } from "@/app/demo-actions";
import { getCurrentUser } from "@/server/session";
import { unreadCount } from "@/server/services/notifications";
import { ThemeToggle, type Theme } from "@/components/theme-toggle";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskFlow",
  description: "Collaborative Kanban project manager",
};

export default async function RootLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await getCurrentUser();
  const unread = user ? await unreadCount(user.id) : 0;
  const saved = (await cookies()).get("theme")?.value;
  const theme: Theme = saved === "light" || saved === "dark" ? saved : "auto";

  return (
    <html lang="en" data-theme={theme === "auto" ? undefined : theme}>
      <body className="min-h-screen bg-page text-fg antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-md focus:bg-surface focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="sticky top-0 z-10 border-b border-line bg-surface">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-[90rem] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm sm:gap-x-6"
          >
            <Link href="/" className="text-base font-semibold text-link">
              TaskFlow
            </Link>
            {user ? (
              <>
                <Link href="/workspaces" className="text-muted hover:text-fg">
                  Workspaces
                </Link>
                <Link
                  href="/notifications"
                  className="text-muted hover:text-fg"
                >
                  Notifications
                  {unread > 0 && (
                    <span
                      className="badge ml-1"
                      aria-label={`${unread} unread`}
                    >
                      {unread}
                    </span>
                  )}
                </Link>
                <Link href="/profile" className="text-muted hover:text-fg">
                  Profile
                </Link>
              </>
            ) : (
              <Link href="/login" className="text-muted hover:text-fg">
                Sign in
              </Link>
            )}
            <ThemeToggle initial={theme} />
          </nav>
        </header>
        {user?.sandboxUntil && (
          <div
            role="note"
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-line bg-subtle px-4 py-2 text-center text-sm"
          >
            <span>
              This is your own demo space, with made-up data. It is deleted on{" "}
              {user.sandboxUntil.toLocaleString("en-GB", {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: "UTC",
              })}{" "}
              UTC, 24 hours after you opened it.
            </span>
            <form action={restartDemo}>
              <button type="submit" className="link">
                Restart demo
              </button>
            </form>
            <form action={leaveDemo}>
              <button type="submit" className="link">
                Leave and delete it
              </button>
            </form>
          </div>
        )}
        <div id="content" className="mx-auto max-w-[90rem] px-4 py-6">
          {children}
        </div>
      </body>
    </html>
  );
}
