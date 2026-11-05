"use client";

import { createContext, useContext, type ReactNode } from "react";
import { catalogs, type Lang } from "@/lib/i18n";

const Context = createContext<Lang>("en");

/** Gives client components the language the server chose, so they render the same text on both sides. */
export function LangProvider({
  lang,
  children,
}: {
  lang: Lang;
  children: ReactNode;
}) {
  return <Context value={lang}>{children}</Context>;
}

/** The language and its catalog, for client components. */
export function useT() {
  const lang = useContext(Context);
  return { lang, t: catalogs[lang] };
}
