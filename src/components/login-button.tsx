"use client";

import { useT } from "@/components/lang-provider";
import { authClient } from "@/lib/auth-client";

export function LoginButton() {
  const { t } = useT();
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
      {t.landing.signInGithub}
    </button>
  );
}
