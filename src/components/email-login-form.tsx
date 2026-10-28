"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { authClient } from "@/lib/auth-client";

/** Sign in or sign up with email and password. The account works only after the emailed link is opened. */
export function EmailLoginForm({ allowSignUp }: { allowSignUp: boolean }) {
  const router = useRouter();
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
      setError(error.message ?? "Something went wrong. Try again.");
    }
  }

  if (sentTo) {
    return (
      <p role="status" className="notice text-left">
        Check your inbox: we sent a confirmation link to {sentTo}. Open it to
        finish; then you can sign in.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 text-left">
      {mode === "signup" && (
        <label className="field">
          Name
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
        Email
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className="input"
        />
      </label>
      <label className="field">
        Password
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
          <p className="text-xs text-muted">At least 10 characters.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="digestEmail" />
            Send me a daily summary of the alerts of my lists
          </label>
        </>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      <button type="submit" disabled={pending} className="btn w-full">
        {mode === "signup" ? "Create account" : "Sign in with email"}
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
          {mode === "signup"
            ? "I already have an account"
            : "Create an account with email"}
        </button>
      )}
    </form>
  );
}
