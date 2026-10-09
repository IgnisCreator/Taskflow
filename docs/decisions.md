# Architecture decisions

Numbered ADRs, newest last. Language: English (repository convention).

## ADR-001 — Runtime and dependency versions

- **Date:** 2026-10-08
- **Status:** accepted (TF-01)

### Decision

All dependency versions are pinned exactly (`--save-exact`, no ranges) and locked in `package-lock.json`; the only range is `engines.node` (`>=24 <25`), which constrains the runtime rather than a package. CI installs the newest Node 24 via `.nvmrc`, while the development machine ran 24.14.1, so `@types/node` 24.19.1 may describe APIs newer than the local runtime. No `latest`, `beta` or `rc` tag is used.

| Package                                      | Version                                             | Published  | Notes                                                                                                                    |
| -------------------------------------------- | --------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------ |
| Node.js                                      | 24 LTS (`engines` `>=24 <25`; developed on 24.14.1) | —          | Next.js >= 20.9, Prisma 7 >= 20.19, Vite 8 >= 20.19                                                                      |
| next                                         | 16.4.0                                              | 2026-10-06 | `npm` `latest`; App Router; `proxy.ts` replaces `middleware.ts`                                                          |
| react / react-dom                            | 19.3.0                                              | 2026-09-09 | `latest`                                                                                                                 |
| typescript                                   | 5.9.3                                               | 2025-09-30 | Deliberately not 7.0.2 (`latest`): Prisma 7 recommends 5.9.x and the lint toolchain was not verified against 7.x         |
| prisma / @prisma/client / @prisma/adapter-pg | 7.10.0                                              | 2026-08-25 | **Same 7.x exact.** `prisma@latest` is `8.0.0-rc.21` (a release candidate) — never use `npm i prisma` without a version  |
| zod                                          | 4.6.5                                               | 2026-09-13 | Environment and input validation                                                                                         |
| eslint                                       | 9.39.5                                              | 2026-07-10 | Deliberately not 10.x (`latest`): `eslint-config-next@16.4.0` peers `eslint >=9` and its plugins were verified on 9 only |
| eslint-config-next                           | 16.4.0                                              | 2026-10-06 |                                                                                                                          |
| prettier                                     | 3.9.9                                               | 2026-09-23 | Default configuration (no `.prettierrc`); ignores come from `.gitignore`                                                 |
| vitest                                       | 5.0.3                                               | 2026-09-30 | Needs `vite` as a non-optional peer                                                                                      |
| vite                                         | 8.3.3                                               | 2026-10-06 | Pinned explicitly because `vitest@5.0.3` requires it (peer `^6.4 \|\| ^7 \|\| ^8`)                                       |
| @types/node                                  | 24.19.1                                             | 2026-10-01 | Matches Node 24                                                                                                          |
| @types/react / @types/react-dom              | 19.3.0                                              | —          |                                                                                                                          |

Removed after the 2026-10-09 audit (no longer direct dependencies): `pg` and `@types/pg` (both are already dependencies of `@prisma/adapter-pg`, so the exact pin of `pg` is now resolved by the lockfile only), `dotenv` (replaced by Node's `process.loadEnvFile()` in `prisma.config.ts`) and `eslint-config-prettier` (0 conflicting active rules with ESLint 9; add it back with any stylistic ESLint plugin). Also removed: `next.config.ts` (empty; re-add for `output: "standalone"` in TF-08), `vitest.config.ts` (re-add with Playwright) and the `db:generate` and `db:migrate:dev` scripts (re-add `db:migrate:dev` in TF-03). `tsconfig.json` keeps `lib` and `allowJs` because `next build` rewrites them anyway.

Deferred (not installed in TF-01): Tailwind CSS, dnd-kit (ADR pending in TF-06), Playwright 1.64.0 (checked, installed with the E2E work), Better Auth (TF-02, see ADR-002).

### Prisma 7 consequences

`prisma-client` generator with required `output` (`src/generated/prisma`, git-ignored, generated on `postinstall`), driver adapter `@prisma/adapter-pg`, ESM (`"type": "module"`), `prisma.config.ts`, explicit `.env` loading.

### Known issues recorded

- `npm audit` on the real project (2026-10-08): 9 high findings in total, 0 critical. **4 appear even with `--omit=dev`**: `prisma@7.10.0` → `@prisma/config` → `deepmerge-ts` (stack exhaustion on recursive objects) and `prisma` → `mysql2@3.15.3` (credential leak via auth-plugin downgrade; the project uses PostgreSQL only). `@prisma/client` pulls the `prisma` CLI in as a peer, so it is in the production dependency tree even though it is listed as a dev dependency. The other 5 (`eslint-config-next` → `fast-glob` → `micromatch` → `braces`) are lint tooling only.
  - No fix is applied: `npm audit fix --dry-run` offers none without `--force`, and forcing it would change pinned versions (the target releases were not inspected; the only newer Prisma is the 8.0 RC, excluded by policy).
  - Follow-up for TF-08: decide whether the runtime image prunes the Prisma CLI, and re-run `npm audit` against newer stable releases.
- Next.js published advisories up to 2026-09-30 (list at the repository security page). Whether 16.4.0 contains every fix was **not verified** from an official patched-versions table; re-check before TF-08.

### Sources (consulted 2026-10-08)

- npm registry (`npm view <pkg> dist-tags / time / peerDependencies`) — https://registry.npmjs.org/
- Next.js installation, v16.4.0 docs — https://nextjs.org/docs/app/getting-started/installation
- Next.js proxy — https://nextjs.org/docs/app/api-reference/file-conventions/proxy
- Prisma 7 upgrade guide — https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7
- Prisma + Auth.js + Next.js guide — https://docs.prisma.io/docs/guides/authentication/authjs/nextjs
- Next.js security advisories — https://github.com/vercel/next.js/security/advisories
- Node.js releases — https://nodejs.org/en/about/previous-releases

## ADR-002 — Authentication library

- **Date:** 2026-10-08
- **Status:** accepted by the project owner (decision D3); implementation starts in TF-02

### Decision

Use **Better Auth 1.7.7** with `@better-auth/prisma-adapter` 1.7.7, GitHub as the social provider, database-backed sessions. Versions are pinned exactly when installed in TF-02.

### Options compared (scratch install, no credentials)

| Criterion                                              | Better Auth 1.7.7                                                                                                                    | next-auth 4.24.15                                            | next-auth 5.0.0-beta.32       |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | ----------------------------- |
| Stable release                                         | Yes (2026-09-30)                                                                                                                     | Yes (2026-07-20)                                             | **No — beta, excluded**       |
| Prisma adapter                                         | `@better-auth/prisma-adapter` 1.7.7; peers `prisma`/`@prisma/client` `^5 \|\| ^6 \|\| ^7`; docs show Prisma 7 + `@prisma/adapter-pg` | `@next-auth/prisma-adapter` 1.0.7; peer `@prisma/client >=3` | `@auth/prisma-adapter` 2.11.3 |
| Type-check with Next 16.4.0 + Prisma 7.10.0 + TS 5.9.3 | Pass                                                                                                                                 | Pass (needed `as never` on the Prisma client)                | Not tested                    |
| Next.js 16 `proxy.ts`                                  | Docs: full check via `auth.api.getSession` (Node runtime) or optimistic `getSessionCookie`                                           | Not evaluated                                                | Docs: split config for edge   |
| DB sessions                                            | Default                                                                                                                              | Supported                                                    | Default with adapter          |
| Maintenance                                            | Active; also maintains Auth.js since 2025-09-22                                                                                      | Security fixes only (per Auth.js announcement)               | —                             |
| Test access                                            | `testUtils()` plugin: helpers create sessions; docs say keep it out of production config                                             | Not evaluated                                                | —                             |

### Outcome in TF-02 (2026-10-09)

1. **Schema:** `npx auth@1.7.7 generate` produced `user`, `session`, `account` and `verification`; the project adds `user.publicId` (random UUID, unique) and a unique `(providerId, accountId)` on `account`. Migration `..._auth`.
2. **Test sessions:** the `testUtils()` plugin works as documented (`createUser`, `saveUser`, `getAuthHeaders`, `getCookies`). It lives only in a test-only auth instance (`tests/helpers/test-auth.ts`); CI greps `src/` for it and the production bundle was checked to contain none of it. There is no route or flag in the app that can create a session.
3. **Provider tokens:** stored encrypted (`account.encryptOAuthTokens`); a test fails if the token appears in plain text.
4. **Origin protection:** with a session cookie, a foreign `Origin` gets 403 `INVALID_ORIGIN` and an off-site `callbackURL` gets 403 `INVALID_CALLBACK_URL`. Better Auth skips these checks when `NODE_ENV` or `TEST` marks a test run (read once at load), so `vitest.config.ts` sets `NODE_ENV=development` and `TEST=false` for the suite.
5. **Still open:** the real GitHub login is a manual check by the owner (see `docs/validation.md`). GitHub accounts without an email cannot sign in, because Better Auth requires one (the `user:email` scope is requested).
6. **Impact on the CV keyword "NextAuth":** decided by the owner.

### Sources (consulted 2026-10-08)

- Better Auth Next.js integration — https://www.better-auth.com/docs/integrations/next
- Better Auth Prisma adapter — https://www.better-auth.com/docs/adapters/prisma
- Better Auth session management — https://www.better-auth.com/docs/concepts/session-management
- Auth.js joins Better Auth — https://www.better-auth.com/blog/authjs-joins-better-auth
- Better Auth test utils — https://better-auth.com/docs/plugins/test-utils
- npm registry metadata for the three packages.

## ADR-003 — API conventions introduced with projects (TF-03)

- **Date:** 2026-10-09
- **Status:** accepted (TF-03)

### Decision

- **Errors:** every failure is `{ error: { code, message, requestId, fields? } }` with codes `UNAUTHENTICATED` 401, `VALIDATION_ERROR` and `INVALID_JSON` 400, `CSRF_ORIGIN` and `FORBIDDEN` 403, `NOT_FOUND` 404, `BOARD_CONFLICT` 409 (with `currentVersion`), `INTERNAL` 500. Unexpected errors are logged by name only, never with payloads.
- **Visibility:** a project the caller is not a member of is always `404`, never `403`; a member without permission gets `403`.
- **CSRF:** every write handler first requires `Origin` to equal the origin of `APP_URL`; a missing or foreign `Origin` is `403 CSRF_ORIGIN`. Browsers always send `Origin` on non-GET fetches. Non-browser clients must send it too.
- **Concurrency:** every write carries `expectedBoardVersion` in the JSON body (also `DELETE`) and goes through `withProjectLock` (`src/server/project-lock.ts`): one `UPDATE project SET boardVersion = boardVersion + 1 WHERE id AND boardVersion = expected AND caller is a member` takes the row lock; `count = 0` becomes `404` for a non-member or `409` for a stale version. Only then is the caller's role read, so a demotion that committed first is honoured. Permissions failing after the lock throw and roll back the bump. No raw SQL, default `READ COMMITTED`.
- **Inputs:** Zod `strictObject`; unknown keys such as `ownerId` are rejected with `400`.
- **Default column names are English** ("To do", "In progress", "In review", "Done") instead of the Spanish names in the original plan, because the portfolio demo is in English. Changing them is one array in `src/server/services/projects.ts`.
- **Deferred:** rate limiting (`429`) is not implemented yet; it is tracked in the backlog notes for the milestone that adds write volume.

## ADR-004 — Member management rules (TF-04)

- **Date:** 2026-10-09
- **Status:** accepted (TF-04)

### Decision

- The owner and ADMINs add, change and remove MEMBER and VIEWER. **Only the owner** may grant, change or remove an ADMIN, and an ADMIN acting on themselves counts as touching an ADMIN. **Nobody** can change or remove the owner, and there is no voluntary leaving or ownership transfer in v1. The rules live in `canManageMember` (`src/server/policies.ts`); the coarse `member:manage` gate (owner or ADMIN) runs first, inside the lock.
- Collaborators are added by `publicId` (random UUID). An unknown ID is `404 USER_NOT_FOUND`, an existing member `409 MEMBER_EXISTS`, and a sixth member `409 LIMIT_REACHED` (counted inside the lock).
- Removing a member un-assigns their tasks in the same transaction (the composite foreign key is `NO ACTION`, so removal would fail otherwise); authorship (`createdById`) is kept.
- Member responses never include email, `publicId` or tokens.
- The settings UI hides controls the caller cannot use with the same `canManageMember`; the server remains the only authority.
