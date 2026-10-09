import type { Metadata } from "next";
import { cookies } from "next/headers";
import Link from "next/link";
import type { ReactNode } from "react";
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
        <header className="border-b border-line bg-surface">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3 text-sm"
          >
            <Link href="/" className="text-base font-semibold text-link">
              TaskFlow
            </Link>
            <Link href="/projects" className="text-muted hover:text-fg">
              Projects
            </Link>
            <Link href="/profile" className="text-muted hover:text-fg">
              Profile
            </Link>
            <ThemeToggle initial={theme} />
          </nav>
        </header>
        <div id="content" className="mx-auto max-w-4xl px-4 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
