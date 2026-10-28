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

describe("parseEnv: the closed deployment", () => {
  const { AUTH_GITHUB_ID: _id, AUTH_GITHUB_SECRET: _secret, ...closed } = valid;

  it("does not need GitHub: a closed deployment has no GitHub login", () => {
    const env = parseEnv(closed);
    expect(env.AUTH_GITHUB_ID).toBeUndefined();
    expect(env.OPEN_ACCESS).toBeUndefined();
  });

  it("wants both GitHub values or neither", () => {
    expect(() => parseEnv({ ...closed, AUTH_GITHUB_ID: "id" })).toThrow(
      /go together/,
    );
    expect(() => parseEnv({ ...closed, AUTH_GITHUB_SECRET: "s" })).toThrow(
      /go together/,
    );
  });

  it("treats an empty value, as .env.example has, as not set", () => {
    const env = parseEnv({
      ...closed,
      AUTH_GITHUB_ID: "",
      AUTH_GITHUB_SECRET: "",
      OPEN_ACCESS: "",
    });
    expect(env.AUTH_GITHUB_ID).toBeUndefined();
    expect(env.OPEN_ACCESS).toBeUndefined();
  });

  it("accepts only 0 or 1 for OPEN_ACCESS, so a typo cannot open the doors", () => {
    expect(parseEnv({ ...closed, OPEN_ACCESS: "1" }).OPEN_ACCESS).toBe("1");
    expect(parseEnv({ ...closed, OPEN_ACCESS: "0" }).OPEN_ACCESS).toBe("0");
    for (const bad of ["true", "yes", "on", "2"]) {
      expect(() => parseEnv({ ...closed, OPEN_ACCESS: bad })).toThrow(
        /OPEN_ACCESS/,
      );
    }
  });
});
