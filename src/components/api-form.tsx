"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent, type ReactNode } from "react";
import { api } from "@/lib/api-client";

/**
 * A form that sends its named fields as JSON to our API, then refreshes the page or goes to
 * `redirectTo` (where "{id}" becomes the id in the response). Checkboxes become booleans, a select
 * left on "" becomes null, and a field named "a.b" goes to `{ a: { b } }`; `extra` adds fixed values
 * such as ids or the board version.
 * With `confirmText`, the submit button stays disabled until that text is typed.
 */
export function ApiForm({
  method,
  url,
  extra,
  redirectTo,
  submit,
  danger = false,
  confirmText,
  className = "space-y-3",
  children,
}: {
  method: "POST" | "PATCH" | "DELETE";
  url: string;
  extra?: Record<string, unknown>;
  redirectTo?: string;
  submit: string;
  danger?: boolean;
  confirmText?: string;
  className?: string;
  children?: ReactNode;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [typed, setTyped] = useState("");

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const body: Record<string, unknown> = { ...extra };
    for (const element of Array.from(form.elements)) {
      if (
        !(element instanceof HTMLInputElement) &&
        !(element instanceof HTMLSelectElement) &&
        !(element instanceof HTMLTextAreaElement)
      )
        continue;
      if (!element.name) continue;
      const value =
        element instanceof HTMLInputElement && element.type === "checkbox"
          ? element.checked
          : element instanceof HTMLSelectElement && element.value === ""
            ? null
            : element.value;
      // "group.key" fills body.group.key (one level is all the forms need).
      const [group, key] = element.name.split(".");
      if (key) {
        body[group!] = { ...(body[group!] as object), [key]: value };
      } else {
        body[element.name] = value;
      }
    }
    setPending(true);
    setError(null);
    const result = await api(method, url, body);
    setPending(false);
    if (!result.ok) {
      setError(result.message);
      if (!result.network) router.refresh();
      return;
    }
    if (redirectTo) {
      const id = (result.data as { id?: string } | null)?.id ?? "";
      router.push(redirectTo.replace("{id}", id));
    } else {
      form.reset();
    }
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className={className}>
      {children}
      {confirmText && (
        <label className="field">
          Type <strong>{confirmText}</strong> to confirm
          <input
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            className="input"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={
          pending || (confirmText !== undefined && typed !== confirmText)
        }
        className={danger ? "btn-danger" : "btn"}
      >
        {submit}
      </button>
    </form>
  );
}
