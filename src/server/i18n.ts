import "server-only";
import { cookies, headers } from "next/headers";
import { LANG_COOKIE, catalogs, pickLang } from "@/lib/i18n";

/** The language of this request: the cookie, else the browser's. */
export async function getLang() {
  return pickLang(
    (await cookies()).get(LANG_COOKIE)?.value,
    (await headers()).get("accept-language"),
  );
}

/** The language and its catalog, for server components. */
export async function getT() {
  const lang = await getLang();
  return { lang, t: catalogs[lang] };
}
