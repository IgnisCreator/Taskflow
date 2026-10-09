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
    <form onSubmit={onSubmit}>
      <h2>Project details</h2>
      <p>
        <label>
          Name
          <input name="name" defaultValue={name} required maxLength={80} />
        </label>
      </p>
      <p>
        <label>
          Description
          <textarea
            name="description"
            defaultValue={description ?? ""}
            maxLength={5000}
          />
        </label>
      </p>
      {message && <p role={failed ? "alert" : "status"}>{message}</p>}
      <button type="submit" disabled={pending}>
        {pending ? "Saving..." : "Save"}
      </button>
    </form>
  );
}
