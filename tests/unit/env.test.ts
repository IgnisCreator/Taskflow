import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/lib/env";

const valid = {
  DATABASE_URL: "postgresql://u:p@localhost:5432/db",
  BETTER_AUTH_SECRET: "x".repeat(32),
  AUTH_GITHUB_ID: "id",
  AUTH_GITHUB_SECRET: "secret",
};

describe("parseEnv", () => {
  it("accepts a complete environment and defaults APP_URL", () => {
    expect(parseEnv(valid).APP_URL).toBe("http://localhost:3000");
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({ ...valid, DATABASE_URL: undefined })).toThrow(
      /DATABASE_URL/,
    );
  });

  it("rejects a non-PostgreSQL URL", () => {
    expect(() =>
      parseEnv({ ...valid, DATABASE_URL: "mysql://u:p@localhost/db" }),
    ).toThrow(/PostgreSQL/);
  });

  it("rejects a short auth secret", () => {
    expect(() => parseEnv({ ...valid, BETTER_AUTH_SECRET: "short" })).toThrow(
      /BETTER_AUTH_SECRET/,
    );
  });
});
