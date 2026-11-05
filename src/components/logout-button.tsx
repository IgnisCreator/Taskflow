"use client";

import { useRouter } from "next/navigation";
import { useT } from "@/components/lang-provider";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
  const { t } = useT();
  return (
    <button
      type="button"
      className="btn-secondary"
      onClick={() =>
        authClient.signOut({
          fetchOptions: { onSuccess: () => router.push("/login") },
        })
      }
    >
      {t.login.signOut}
    </button>
  );
}
