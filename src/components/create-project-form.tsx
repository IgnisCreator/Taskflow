"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";

export function CreateProjectForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        const fieldMessage = Object.values(body.error.fields ?? {}).flat()[0];
        setError(String(fieldMessage ?? body.error.message));
        return;
      }
      router.push(`/projects/${body.id}`);
    } catch {
      setError("Could not reach the server. Check your connection and retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <h2>New project</h2>
      <p>
        <label>
          Name
          <input name="name" required maxLength={80} />
        </label>
      </p>
      <p>
        <label>
          Description (optional)
          <textarea name="description" maxLength={5000} />
        </label>
      </p>
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Creating..." : "Create project"}
      </button>
    </form>
  );
}
