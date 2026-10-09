import "server-only";
import { z, ZodError } from "zod";
import { getEnv } from "@/lib/env";
import { getCurrentUser } from "@/server/session";

/** A failure with a stable code that route handlers turn into `{ error: { code, message, requestId } }`. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

const NO_STORE = { "Cache-Control": "private, no-store" };

export function json(data: unknown, status = 200) {
  return Response.json(data, { status, headers: NO_STORE });
}

export function noContent() {
  return new Response(null, { status: 204, headers: NO_STORE });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>,
) {
  const error = { code, message, requestId: crypto.randomUUID(), ...extra };
  return Response.json({ error }, { status, headers: NO_STORE });
}

/** Wraps a route handler: known failures keep their code; anything else is logged without payloads. */
export function handle<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
) {
  return async (...args: Args): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (error) {
      if (error instanceof ApiError) {
        return errorResponse(
          error.status,
          error.code,
          error.message,
          error.extra,
        );
      }
      if (error instanceof ZodError) {
        return errorResponse(400, "VALIDATION_ERROR", "Invalid input", {
          fields: z.flattenError(error).fieldErrors,
        });
      }
      console.error("Unhandled route error:", (error as Error).name);
      return errorResponse(500, "INTERNAL", "Unexpected error");
    }
  };
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw new ApiError(401, "UNAUTHENTICATED", "Sign in required");
  return user;
}

/** Every handler that changes data calls this first (CSRF defence for cookie sessions). */
export function assertSameOrigin(request: Request) {
  if (request.headers.get("origin") !== new URL(getEnv().APP_URL).origin) {
    throw new ApiError(403, "CSRF_ORIGIN", "Origin not allowed");
  }
}

export async function readJson<T extends z.ZodType>(
  request: Request,
  schema: T,
): Promise<z.infer<T>> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Body must be valid JSON");
  }
  return schema.parse(body);
}
