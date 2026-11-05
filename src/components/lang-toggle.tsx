"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { LANGS, saveLang, type Lang } from "@/lib/i18n";

/** The language selector. The choice is a cookie (like the theme); the server then renders the new language. */
export function LangToggle() {
  const router = useRouter();
  const { lang, t } = useT();

  function choose(next: Lang) {
    if (next === lang) return;
    saveLang(next);
    router.refresh();
  }

  return (
    <div role="group" aria-label={t.language.label} className="flex gap-1">
      {LANGS.map((code) => (
        <button
          key={code}
          type="button"
          lang={code}
          aria-pressed={code === lang}
          title={t.language[code]}
          className={`${code === lang ? "btn" : "btn-secondary"} px-2 py-1 text-xs uppercase`}
          onClick={() => choose(code)}
        >
          {code}
        </button>
      ))}
    </div>
  );
}
