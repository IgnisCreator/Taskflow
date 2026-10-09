import { vi } from "vitest";

export const githubUser = {
  id: 424242,
  login: "tf-test",
  name: "TF Test",
  email: "tf-test@example.test",
  avatar_url: "https://example.test/avatar.png",
};

/** Answers GitHub's OAuth endpoints locally; every other request goes to the real fetch. */
export function stubGithub() {
  const real = globalThis.fetch;
  vi.stubGlobal(
    "fetch",
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url;
      if (url.startsWith("https://github.com/login/oauth/access_token")) {
        return Response.json({
          access_token: "gho_plain_text_token",
          token_type: "bearer",
          scope: "read:user,user:email",
        });
      }
      if (url === "https://api.github.com/user")
        return Response.json(githubUser);
      if (url.startsWith("https://api.github.com/user/emails")) {
        return Response.json([
          {
            email: githubUser.email,
            primary: true,
            verified: true,
            visibility: "public",
          },
        ]);
      }
      return real(input, init);
    },
  );
}
