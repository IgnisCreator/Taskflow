type Failure = { ok: false; message: string; conflict: boolean };
type Success = { ok: true; data: unknown };

/** Browser-side JSON call to our API. Same-origin fetches carry the Origin header the server requires. */
export async function api(
  method: "POST" | "PATCH" | "DELETE",
  url: string,
  body: unknown,
): Promise<Success | Failure> {
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
      message: conflict
        ? "The project changed in the meantime. The page was refreshed; try again."
        : String(field ?? payload.error?.message ?? "Something went wrong"),
    };
  } catch {
    return {
      ok: false,
      conflict: false,
      message: "Could not reach the server. Check your connection and retry.",
    };
  }
}
