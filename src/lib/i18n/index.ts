import { en, type Catalog } from "./en";
import { es } from "./es";

export const LANGS = ["en", "es"] as const;
export type Lang = (typeof LANGS)[number];
export const LANG_COOKIE = "lang";

export const catalogs: Record<Lang, Catalog> = { en, es };

/** The locale each language formats dates and numbers with. */
export const LOCALE: Record<Lang, string> = { en: "en-GB", es: "es-ES" };

const isLang = (value: string | undefined | null): value is Lang =>
  LANGS.includes(value as Lang);

/**
 * The cookie if it holds a language we have; otherwise the first language the browser asks for that
 * we have (highest `q` first); otherwise English.
 */
export function pickLang(
  cookie: string | undefined,
  acceptLanguage: string | null,
): Lang {
  if (isLang(cookie)) return cookie;
  const asked = (acceptLanguage ?? "")
    .split(",")
    .map((part) => {
      const [tag = "", q] = part.trim().split(";q=");
      return { primary: tag.split("-")[0]!.toLowerCase(), q: Number(q ?? 1) };
    })
    .filter((a) => a.q > 0)
    .sort((a, b) => b.q - a.q);
  return (
    (asked.find((a) => isLang(a.primary))?.primary as Lang | undefined) ?? "en"
  );
}

/** The language of the page being shown, in the browser (the server writes it in `<html lang>`). */
export const browserLang = (): Lang => {
  const lang =
    typeof document === "undefined" ? undefined : document.documentElement.lang;
  return isLang(lang) ? lang : "en";
};

/** Remembers the visitor's choice for a year (browser only); the server reads it on the next request. */
export function saveLang(lang: Lang) {
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
}

/** A day-month-year and time in UTC, as the screens show instants (no zone name: the caller adds it). */
export const formatDateTime = (date: Date, lang: Lang) =>
  date.toLocaleString(LOCALE[lang], {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });

/** A number with a fixed count of decimals, with the language's decimal mark. */
export const formatNumber = (value: number, lang: Lang, decimals = 1) =>
  value.toLocaleString(LOCALE[lang], {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

/** One of two forms by count: both languages treat exactly 1 as singular. */
export const plural = (n: number, one: string, other: string) =>
  n === 1 ? one : other;
