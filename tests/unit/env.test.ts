import { describe, expect, it } from "vitest";
import { parseEnv } from "../../src/lib/env";

describe("parseEnv", () => {
  it("accepts a PostgreSQL URL", () => {
    const url = "postgresql://u:p@localhost:5432/db";
    expect(parseEnv({ DATABASE_URL: url }).DATABASE_URL).toBe(url);
  });

  it("rejects a missing DATABASE_URL", () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it("rejects a non-PostgreSQL URL", () => {
    expect(() =>
      parseEnv({ DATABASE_URL: "mysql://u:p@localhost/db" }),
    ).toThrow(/PostgreSQL/);
  });
});
