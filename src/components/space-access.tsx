"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api-client";
import type { Role } from "@/lib/validations/workspaces";

type Person = { userId: string; name: string; role: Role; listed: boolean };

/**
 * Who is listed in a space. Owner and admins always see every space; listing matters for members
 * (private spaces) and guests (any space).
 */
export function SpaceAccess({
  spaceId,
  people,
}: {
  spaceId: string;
  people: Person[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function toggle(person: Person) {
    setPending(true);
    setError(null);
    const base = `/api/spaces/${spaceId}/members`;
    const result = person.listed
      ? await api("DELETE", `${base}/${person.userId}`, {})
      : await api("POST", base, { userId: person.userId });
    setPending(false);
    if (!result.ok) setError(result.message);
    router.refresh();
  }

  const listable = people.filter(
    (p) => p.role === "MEMBER" || p.role === "GUEST",
  );
  return (
    <section className="card space-y-3">
      <h2 className="text-lg font-semibold">Who can see it</h2>
      <p className="text-sm text-muted">
        The owner and admins see every space. Members see public spaces and the
        private ones they are listed in; guests only the spaces they are listed
        in.
      </p>
      {listable.length === 0 ? (
        <p className="text-sm text-muted">
          There are no members or guests in the workspace yet.
        </p>
      ) : (
        <ul className="space-y-2">
          {listable.map((person) => (
            <li key={person.userId}>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={person.listed}
                  disabled={pending}
                  onChange={() => void toggle(person)}
                />
                {person.name}
                <span className="badge">{person.role.toLowerCase()}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
    </section>
  );
}
