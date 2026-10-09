"use client";

export default function ErrorPage({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="space-y-3">
      <h1 className="text-2xl font-semibold">Something went wrong</h1>
      <p role="alert" className="text-muted">
        The page could not be loaded. Your data was not changed.
      </p>
      <button type="button" className="btn" onClick={reset}>
        Try again
      </button>
    </main>
  );
}
