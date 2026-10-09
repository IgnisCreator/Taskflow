"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { api } from "@/lib/api-client";
import { canManageMember, type Actor } from "@/server/policies";

type Role = "ADMIN" | "MEMBER" | "VIEWER";
type Member = {
  userId: string;
  name: string;
  role: Role;
  isOwner: boolean;
};

// The server decides; this only hides controls the caller could not use.
export function MembersPanel({
  projectId,
  boardVersion,
  members,
  actor,
}: {
  projectId: string;
  boardVersion: number;
  members: Member[];
  actor: Actor;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const canManage = actor.role === "ADMIN";

  async function run(action: () => ReturnType<typeof api>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok) setError(result.message);
    router.refresh();
    return result.ok;
  }

  const base = `/api/projects/${projectId}/members`;

  function onAdd(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    void run(() =>
      api("POST", base, {
        publicId: String(data.get("publicId") ?? "").trim(),
        role: data.get("role"),
        expectedBoardVersion: boardVersion,
      }),
    ).then((ok) => ok && form.reset());
  }

  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-semibold">Members</h2>
      <ul className="divide-y divide-line">
        {members.map((member) => {
          const manageable = (to?: Role) =>
            canManageMember(actor, {
              from: member.role,
              to,
              targetIsOwner: member.isOwner,
            });
          return (
            <li
              key={member.userId}
              className="flex flex-wrap items-center justify-between gap-2 py-2"
            >
              <span className="font-medium">{member.name}</span>
              <span className="flex items-center gap-2">
                {manageable("MEMBER") ? (
                  <select
                    aria-label={`Role of ${member.name}`}
                    value={member.role}
                    disabled={pending}
                    className="input mt-0 w-auto"
                    onChange={(event) =>
                      run(() =>
                        api("PATCH", `${base}/${member.userId}`, {
                          role: event.target.value,
                          expectedBoardVersion: boardVersion,
                        }),
                      )
                    }
                  >
                    {actor.isOwner && <option value="ADMIN">Admin</option>}
                    <option value="MEMBER">Member</option>
                    <option value="VIEWER">Viewer</option>
                  </select>
                ) : (
                  <span className="badge">
                    {member.isOwner ? "owner" : member.role}
                  </span>
                )}
                {manageable() && (
                  <button
                    type="button"
                    disabled={pending}
                    className="btn-secondary"
                    onClick={() => {
                      if (
                        window.confirm(
                          `Remove ${member.name}? Their tasks become unassigned.`,
                        )
                      ) {
                        void run(() =>
                          api("DELETE", `${base}/${member.userId}`, {
                            expectedBoardVersion: boardVersion,
                          }),
                        );
                      }
                    }}
                  >
                    Remove {member.name}
                  </button>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      {canManage && (
        <form onSubmit={onAdd} className="space-y-4 border-t border-line pt-4">
          <h3 className="font-medium">Add a member</h3>
          <p className="text-sm text-muted">
            Ask the person to sign in and copy the public ID from their profile.
            They get access immediately.
          </p>
          <label className="field">
            Public ID
            <input name="publicId" required className="input" />
          </label>
          <label className="field">
            Role
            <select name="role" defaultValue="MEMBER" className="input">
              {actor.isOwner && <option value="ADMIN">Admin</option>}
              <option value="MEMBER">Member</option>
              <option value="VIEWER">Viewer</option>
            </select>
          </label>
          <button type="submit" disabled={pending} className="btn">
            Add member
          </button>
        </form>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
