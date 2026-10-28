import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z
    .string()
    .min(1, "DATABASE_URL is required")
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "DATABASE_URL must be a PostgreSQL connection URL",
    ),
  BETTER_AUTH_SECRET: z
    .string()
    .min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  /** GitHub login, for development only: used when both are set and OPEN_ACCESS=1. */
  AUTH_GITHUB_ID: z.string().min(1).optional(),
  AUTH_GITHUB_SECRET: z.string().min(1).optional(),
  /**
   * "1" opens the doors as in development: public sign-up with email and GitHub login. Anything
   * else (the default) is the closed deployment: accounts are made with `npm run user:create`.
   */
  OPEN_ACCESS: z.enum(["0", "1"]).optional(),
  /** Public base URL of the app; the GitHub callback is `${APP_URL}/api/auth/callback/github`. */
  APP_URL: z.url().default("http://localhost:3000"),
});

export type Env = z.infer<typeof envSchema>;

const envRules = envSchema.refine(
  (env) => Boolean(env.AUTH_GITHUB_ID) === Boolean(env.AUTH_GITHUB_SECRET),
  "AUTH_GITHUB_ID and AUTH_GITHUB_SECRET go together: set both or neither",
);

export function parseEnv(source: Record<string, string | undefined>): Env {
  // An empty value (as in .env.example) means "not set".
  const set = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== ""),
  );
  const result = envRules.safeParse(set);
  if (!result.success) {
    const problems = result.error.issues.map(
      (issue) => `${issue.path.join(".")}: ${issue.message}`,
    );
    throw new Error(`Invalid environment variables:\n${problems.join("\n")}`);
  }
  return result.data;
}

let cached: Env | undefined;

/** Validated environment, read lazily so importing this module never throws. */
export function getEnv(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}

/** Is this an open deployment (development)? Closed by default: no sign-up and no GitHub login. */
export const openAccess = () => getEnv().OPEN_ACCESS === "1";

/** Is GitHub login offered? Only in an open deployment where its credentials are set. */
export const githubLogin = () =>
  openAccess() &&
  Boolean(getEnv().AUTH_GITHUB_ID && getEnv().AUTH_GITHUB_SECRET);
