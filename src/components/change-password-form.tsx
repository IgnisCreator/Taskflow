"use client";

import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

/** Changes the password of an account that has one; the other sessions are signed out. */
export function ChangePasswordForm() {
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const next = String(data.get("newPassword"));
    setError(null);
    setDone(false);
    if (next !== String(data.get("confirmPassword"))) {
      setError("The new passwords do not match.");
      return;
    }
    setPending(true);
    const { error } = await authClient.changePassword({
      currentPassword: String(data.get("currentPassword")),
      newPassword: next,
      revokeOtherSessions: true,
    });
    setPending(false);
    if (error) {
      setError(error.message ?? "Could not change the password.");
      return;
    }
    form.reset();
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="text-lg font-semibold">Change password</h2>
      <label className="field">
        Current password
        <input
          name="currentPassword"
          type="password"
          required
          maxLength={128}
          autoComplete="current-password"
          className="input"
        />
      </label>
      <label className="field">
        New password
        <input
          name="newPassword"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          className="input"
        />
      </label>
      <label className="field">
        Repeat the new password
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete="new-password"
          className="input"
        />
      </label>
      <p className="text-xs text-muted">
        At least 10 characters. Your other sessions are signed out.
      </p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="notice">
          Password changed.
        </p>
      )}
      <button type="submit" disabled={pending} className="btn">
        Change password
      </button>
    </form>
  );
}
