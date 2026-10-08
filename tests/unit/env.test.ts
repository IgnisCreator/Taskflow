import { describe, expect, it } from "vitest";
import { parseEnv } from "@/lib/env";

describe("parseEnv", () => {
  it("accepts a PostgreSQL URL and defaults NODE_ENV", () => {
    const env = parseEnv({
      DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    });
    expect(env.NODE_ENV).toBe("development");
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
