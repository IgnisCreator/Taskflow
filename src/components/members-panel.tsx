"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiForm } from "@/components/api-form";
import { api } from "@/lib/api-client";
import { roleLabel } from "@/lib/roles";
import type { Role } from "@/lib/validations/workspaces";
import { canManageMember, type Actor } from "@/server/policies";

type Member = { userId: string; name: string; role: Role };

// The server decides; this only hides controls the caller could not use.
export function MembersPanel({
  workspaceId,
  members,
  actor,
  labels,
}: {
  workspaceId: string;
  members: Member[];
  actor: Actor;
  labels: Record<string, string>;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const base = `/api/workspaces/${workspaceId}/members`;
  const grantable = (["ADMIN", "MEMBER", "GUEST"] as const).filter((to) =>
    canManageMember(actor, { to }),
  );

  async function run(action: () => ReturnType<typeof api>) {
    setPending(true);
    setError(null);
    const result = await action();
    setPending(false);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  return (
    <section className="card space-y-4">
      <h2 className="text-lg font-semibold">
        Members <span className="badge">{members.length} / 20</span>
      </h2>
      <ul className="divide-y divide-line">
        {members.map((member) => (
          <li
            key={member.userId}
            className="flex flex-wrap items-center justify-between gap-2 py-2"
          >
            <span className="font-medium">{member.name}</span>
            <span className="flex items-center gap-2">
              {canManageMember(actor, { from: member.role, to: "GUEST" }) ? (
                <select
                  aria-label={`Role of ${member.name}`}
                  value={member.role}
                  disabled={pending}
                  className="input mt-0 w-auto"
                  onChange={(event) =>
                    run(() =>
                      api("PATCH", `${base}/${member.userId}`, {
                        role: event.target.value,
                      }),
                    )
                  }
                >
                  {grantable.map((role) => (
                    <option key={role} value={role}>
                      {roleLabel(labels, role)}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="badge normal-case">
                  {roleLabel(labels, member.role)}
                </span>
              )}
              {canManageMember(actor, { from: member.role }) && (
                <button
                  type="button"
                  disabled={pending}
                  className="btn-secondary"
                  onClick={() => {
                    if (
                      window.confirm(
                        `Remove ${member.name}? Their tasks in this workspace become unassigned.`,
                      )
                    ) {
                      void run(() =>
                        api("DELETE", `${base}/${member.userId}`, {}),
                      );
                    }
                  }}
                >
                  Remove {member.name}
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {grantable.length > 0 && (
        <ApiForm
          method="POST"
          url={base}
          submit="Add member"
          className="space-y-3 border-t border-line pt-4"
        >
          <h3 className="font-medium">Add a member</h3>
          <p className="text-sm text-muted">
            The person needs an account already. Use the exact email they sign
            in with.
          </p>
          <label className="field">
            Email
            <input name="email" type="email" required className="input" />
          </label>
          <label className="field">
            Role
            <select name="role" defaultValue="MEMBER" className="input">
              {grantable.map((role) => (
                <option key={role} value={role}>
                  {roleLabel(labels, role)}
                </option>
              ))}
            </select>
          </label>
        </ApiForm>
      )}
    </section>
  );
}
