"use client";

import { useState, type FormEvent } from "react";
import { useT } from "@/components/lang-provider";
import { authClient } from "@/lib/auth-client";

/** Changes the password of an account that has one; the other sessions are signed out. */
export function ChangePasswordForm() {
  const { t } = useT();
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
      setError(t.profile.mismatch);
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
      const known = t.login.authErrors as Record<string, string | undefined>;
      setError(
        (error.code ? known[error.code] : undefined) ??
          error.message ??
          t.profile.changeFailed,
      );
      return;
    }
    form.reset();
    setDone(true);
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3">
      <h2 className="text-lg font-semibold">{t.profile.changePassword}</h2>
      <label className="field">
        {t.profile.currentPassword}
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
        {t.profile.newPassword}
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
        {t.profile.repeatPassword}
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
      <p className="text-xs text-muted">{t.profile.passwordHint}</p>
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="notice">
          {t.profile.changed}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn">
        {t.profile.changePassword}
      </button>
    </form>
  );
}
