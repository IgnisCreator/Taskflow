"use client";

import { useT } from "@/components/lang-provider";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  const { t } = useT();
  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-semibold">{t.errors.pageTitle}</h1>
      <p role="alert" className="text-muted">
        {t.errors.pageBody}
      </p>
      <button type="button" className="btn" onClick={reset}>
        {t.errors.retry}
      </button>
    </main>
  );
}
