"use client";

import { authClient } from "@/lib/auth-client";

export function LoginButton() {
  return (
    <button
      type="button"
      onClick={() =>
        authClient.signIn.social({
          provider: "github",
          callbackURL: "/projects",
        })
      }
    >
      Sign in with GitHub
    </button>
  );
}
