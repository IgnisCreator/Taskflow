"use client";

import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function LogoutButton() {
  const router = useRouter();
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
      Sign out
    </button>
  );
}
