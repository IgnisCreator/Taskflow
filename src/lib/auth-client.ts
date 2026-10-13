import { inferAdditionalFields } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  // Same extra field as in src/server/auth.ts, so sign-up can send it.
  plugins: [
    inferAdditionalFields({ user: { digestEmail: { type: "boolean" } } }),
  ],
});
