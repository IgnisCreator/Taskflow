"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

const POLL_MS = 10_000;

/**
 * Keeps a page that shows a list up to date: while the tab is visible it reads the board version
 * every 10 s and when the tab gets focus, and when it differs from the one the page was built with
 * (someone else changed the list) it calls `onChange` and refreshes. `paused` holds it back while
 * the page has a change of its own in flight.
 */
export function useVersionPolling({
  listId,
  boardVersion,
  paused,
  onChange,
}: {
  listId: string;
  boardVersion: number;
  paused: boolean;
  onChange: () => void;
}) {
  const router = useRouter();
  const versionRef = useRef(boardVersion);
  const pausedRef = useRef(paused);
  const onChangeRef = useRef(onChange);
  useEffect(() => {
    versionRef.current = boardVersion;
    pausedRef.current = paused;
    onChangeRef.current = onChange;
  });

  useEffect(() => {
    async function check() {
      if (document.visibilityState !== "visible" || pausedRef.current) return;
      try {
        const res = await fetch(`/api/lists/${listId}/version`, {
          cache: "no-store",
        });
        if (!res.ok) return;
        const latest = (await res.json()).boardVersion;
        if (latest !== versionRef.current) {
          onChangeRef.current();
          router.refresh();
        }
      } catch {
        // Offline: try again on the next tick.
      }
    }
    const timer = setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", check);
    };
  }, [listId, router]);
}
