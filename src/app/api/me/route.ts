import { getCurrentUser } from "@/server/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return Response.json(
      { error: { code: "UNAUTHENTICATED", message: "Sign in required" } },
      { status: 401, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  return Response.json(user, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
