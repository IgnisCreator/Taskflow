import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "../../src/proxy";

describe("proxy", () => {
  it("redirects to /login when there is no session cookie", () => {
    const res = proxy(new NextRequest("http://localhost:3000/profile"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });
});
