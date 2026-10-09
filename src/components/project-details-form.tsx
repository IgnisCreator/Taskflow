"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";

export function ProjectDetailsForm({
  projectId,
  boardVersion,
  name,
  description,
}: {
  projectId: string;
  boardVersion: number;
  name: string;
  description: string | null;
}) {
  const router = useRouter();
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    const result = await api("PATCH", `/api/projects/${projectId}`, {
      name: form.get("name"),
      description: form.get("description"),
      expectedBoardVersion: boardVersion,
    });
    setPending(false);
    setFailed(!result.ok);
    setMessage(result.ok ? "Saved." : result.message);
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-4">
      <h2 className="text-lg font-semibold">Project details</h2>
      <label className="field">
        Name
        <input
          name="name"
          defaultValue={name}
          required
          maxLength={80}
          className="input"
        />
      </label>
      <label className="field">
        Description
        <textarea
          name="description"
          defaultValue={description ?? ""}
          maxLength={5000}
          rows={3}
          className="input"
        />
      </label>
      {message && (
        <p
          role={failed ? "alert" : "status"}
          className={failed ? "error" : "notice"}
        >
          {message}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn">
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
