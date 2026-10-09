"use client";

import { useState } from "react";

export type Theme = "auto" | "light" | "dark";

const NEXT: Record<Theme, Theme> = {
  auto: "light",
  light: "dark",
  dark: "auto",
};
const LABEL: Record<Theme, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
};

/** Cycles Auto (system) -> Light -> Dark. The choice is a cookie so the server renders it without a flash. */
export function ThemeToggle({ initial }: { initial: Theme }) {
  const [theme, setTheme] = useState<Theme>(initial);

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
      className="btn-secondary ml-auto px-2 py-1 text-xs"
      aria-label={`Theme: ${LABEL[theme]}. Switch to ${LABEL[NEXT[theme]]}`}
      onClick={() => choose(NEXT[theme])}
    >
      Theme: {LABEL[theme]}
    </button>
  );
}
