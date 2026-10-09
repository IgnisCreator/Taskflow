import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const path = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path("./src"),
      // Next.js resolves this marker package internally; tests need a stub.
      "server-only": path("./tests/stubs/server-only.ts"),
    },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    setupFiles: ["tests/setup.ts"],
    // Integration tests share one database; run files one at a time.
    fileParallelism: false,
    // Better Auth reads NODE_ENV and TEST once at load and skips its CSRF/origin checks when
    // either marks a test run; Vitest sets TEST=true. Run as in real use so the origin tests hit the real defence.
    env: { NODE_ENV: "development", TEST: "false" },
  },
});
