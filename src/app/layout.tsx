import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "TaskFlow",
  description: "Collaborative Kanban project manager",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-50 text-slate-900 antialiased">
        <a
          href="#content"
          className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:rounded-md focus:bg-white focus:px-3 focus:py-2"
        >
          Skip to content
        </a>
        <header className="border-b border-slate-200 bg-white">
          <nav
            aria-label="Main"
            className="mx-auto flex max-w-4xl items-center gap-6 px-4 py-3 text-sm"
          >
            <Link href="/" className="text-base font-semibold text-indigo-700">
              TaskFlow
            </Link>
            <Link
              href="/projects"
              className="text-slate-600 hover:text-slate-900"
            >
              Projects
            </Link>
            <Link
              href="/profile"
              className="text-slate-600 hover:text-slate-900"
            >
              Profile
            </Link>
          </nav>
        </header>
        <div id="content" className="mx-auto max-w-4xl px-4 py-8">
          {children}
        </div>
      </body>
    </html>
  );
}
