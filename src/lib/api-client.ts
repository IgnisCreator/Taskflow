import { browserLang, catalogs } from "@/lib/i18n";

type Failure = {
  ok: false;
  message: string;
  /** True for BOARD_CONFLICT: someone else changed the board first. */
  conflict: boolean;
  /** The server's current board version, present on a conflict. */
  currentVersion?: number;
  /** True when no response arrived (offline, aborted): the server was not reached. */
  network?: boolean;
};
type Success = { ok: true; data: unknown };

/** Browser-side JSON call to our API. Same-origin fetches carry the Origin header the server requires. */
export async function api(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  url: string,
  body: unknown,
): Promise<Success | Failure> {
  const lang = browserLang();
  const t = catalogs[lang];
  // English keeps the server's own (more specific) message; other languages use the catalog by code.
  const translated = (code: string | undefined) =>
    lang === "en" || !code
      ? undefined
      : (t.errors.codes as Record<string, string | undefined>)[code];
  try {
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (res.status === 204) return { ok: true, data: null };
    const payload = await res.json();
    if (res.ok) return { ok: true, data: payload };

    const conflict = payload.error?.code === "BOARD_CONFLICT";
    const field = Object.values(payload.error?.fields ?? {}).flat()[0];
    return {
      ok: false,
      conflict,
      currentVersion: payload.error?.currentVersion,
      message: conflict
        ? t.errors.conflict
        : String(
            field ??
              translated(payload.error?.code) ??
              payload.error?.message ??
              t.errors.generic,
          ),
    };
  } catch {
    return {
      ok: false,
      conflict: false,
      network: true,
      message: t.errors.network,
    };
  }
}
