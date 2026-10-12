import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
import { getCurrentUser } from "@/server/session";
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
            className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-3 text-sm sm:gap-6"
          >
            <Link href="/" className="text-base font-semibold text-link">
              TaskFlow
            </Link>
            {user ? (
              <>
                <Link href="/workspaces" className="text-muted hover:text-fg">
                  Workspaces
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
        <div id="content" className="mx-auto max-w-6xl px-4 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
