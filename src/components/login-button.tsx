"use client";

import { authClient } from "@/lib/auth-client";

export function LoginButton() {
  return (
    <button
      type="button"
      className="btn w-full"
      onClick={() =>
        authClient.signIn.social({
          provider: "github",
          callbackURL: "/workspaces",
        })
      }
    >
      Sign in with GitHub
    </button>
  );
}
