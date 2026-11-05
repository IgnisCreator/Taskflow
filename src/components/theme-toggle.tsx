"use client";

import { useState } from "react";
import { useT } from "@/components/lang-provider";

export type Theme = "auto" | "light" | "dark";

const NEXT: Record<Theme, Theme> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};

/** Cycles Auto (system) -> Light -> Dark. The choice is a cookie so the server renders it without a flash. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);
  const { t } = useT();

  function choose(next: Theme) {
    setTheme(next);
    const root = document.documentElement;
    if (next === "auto") {
      delete root.dataset.theme;
      document.cookie = "theme=; path=/; max-age=0; samesite=lax";
    } else {
      root.dataset.theme = next;
      document.cookie = `theme=${next}; path=/; max-age=31536000; samesite=lax`;
    }
  }

  return (
    <button
      type="button"
      className="btn-secondary px-2 py-1 text-xs whitespace-nowrap"
      aria-label={t.theme.switchTo(t.theme[theme], t.theme[NEXT[theme]])}
      onClick={() => choose(NEXT[theme])}
    >
      {t.theme.button(t.theme[theme])}
    </button>
  );
}
