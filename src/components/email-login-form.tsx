"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { useT } from "@/components/lang-provider";
import { authClient } from "@/lib/auth-client";

/** Sign in or sign up with email and password. The account works only after the emailed link is opened. */
export function EmailLoginForm({ allowSignUp }: { allowSignUp: boolean }) {
  const router = useRouter();
  const { t } = useT();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    setError(null);
    setPending(true);
    const callbackURL = "/workspaces";
    const { error } =
      mode === "signup"
        ? await authClient.signUp.email({
            name: String(form.get("name")),
            email,
            password,
            digestEmail: form.get("digestEmail") === "on",
            callbackURL,
          })
        : await authClient.signIn.email({ email, password, callbackURL });
    setPending(false);
    if (!error) {
      if (mode === "signup") setSentTo(email);
      else {
        router.push(callbackURL);
        router.refresh(); // the header now shows the signed-in links
      }
    } else if (error.status === 403) {
      setSentTo(email); // not confirmed yet: the server sent a new link
    } else {
      const known = t.login.authErrors as Record<string, string | undefined>;
      setError(
        (error.code ? known[error.code] : undefined) ??
          error.message ??
          t.login.failed,
      );
    }
  }

  if (sentTo) {
    return (
      <p role="status" className="notice text-left">
        {t.login.sent(sentTo)}
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-left">
      {mode === "signup" && (
        <label className="field">
          {t.login.name}
          <input
            name="name"
            required
            maxLength={100}
            autoComplete="name"
            className="input"
          />
        </label>
      )}
      <label className="field">
        {t.login.email}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
        />
      </label>
      <label className="field">
        {t.login.password}
        <input
          name="password"
          type="password"
          required
          minLength={10}
          maxLength={128}
          autoComplete={mode === "signup" ? "new-password" : "current-password"}
          className="input"
        />
      </label>
      {mode === "signup" && (
        <>
          <p className="text-xs text-muted">{t.login.atLeast10}</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="digestEmail" />
            {t.login.digestOptIn}
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn w-full">
        {mode === "signup" ? t.login.create : t.login.signInEmail}
      </button>
      {allowSignUp && (
        <button
          type="button"
          className="link w-full text-sm"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError(null);
          }}
        >
          {mode === "signup" ? t.login.haveAccount : t.login.createWithEmail}
        </button>
      )}
    </form>
  );
}
