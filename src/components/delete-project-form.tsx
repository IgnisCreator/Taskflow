"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";

export function DeleteProjectForm({
  projectId,
  boardVersion,
  name,
}: {
  projectId: string;
  boardVersion: number;
  name: string;
}) {
  const router = useRouter();
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    const result = await api("DELETE", `/api/projects/${projectId}`, {
      expectedBoardVersion: boardVersion,
    });
    setPending(false);
    if (result.ok) {
      router.push("/projects");
      router.refresh();
    } else {
      setError(result.message);
      router.refresh();
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="card space-y-4 border-red-200 bg-red-50/40"
    >
      <h2 className="text-lg font-semibold text-red-800">Delete project</h2>
      <p className="text-sm text-slate-700">
        This permanently deletes the project, its board and its tasks. Type{" "}
        <strong>{name}</strong> to confirm.
      </p>
      <label className="field">
        Project name
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          className="input"
        />
      </label>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={pending || typed !== name}
        className="btn-danger"
      >
        Delete project
      </button>
    </form>
  );
}
