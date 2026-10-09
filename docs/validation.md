# Validation log

Every row is a command that was actually run. A planned check does not count. Environment for all rows below: Windows 11, Node v24.14.1, npm 11.11.0, Docker 29.5.3.

## TF-01 — clean clone, 2026-10-08

Method: `git clone` of the repository into an empty directory, `.env` created from `.env.example`, fresh PostgreSQL volume. Commit under test: `32beb0c`.

| #   | Command                                                 | Result                                                      | Time |
| --- | ------------------------------------------------------- | ----------------------------------------------------------- | ---- |
| 1   | `npm ci`                                                | exit 0 (postinstall `prisma generate` ran)                  | 68 s |
| 2   | `npm run lint`                                          | exit 0                                                      | 37 s |
| 3   | `npm run format:check`                                  | exit 0                                                      | 1 s  |
| 4   | `npm run typecheck`                                     | exit 0                                                      | 4 s  |
| 5   | `npm test`                                              | exit 0, 1 file, 3 tests passed                              | 4 s  |
| 6   | `npm run db:validate`                                   | exit 0, schema valid                                        | 2 s  |
| 7   | `npm run build`                                         | exit 0, Next.js 16.4.0, routes `/` and `/_not-found` static | 16 s |
| 8   | `docker compose up -d --wait`                           | exit 0, container `healthy` (healthcheck, not just started) | 7 s  |
| 9   | `npm run db:migrate`                                    | exit 0, "No migration found" (no models until TF-03)        | —    |
| 10  | `SELECT 1` through `pg` with `DATABASE_URL` from `.env` | `{ ok: 1 }`                                                 | —    |
| 11  | `npm run start` then `GET /`                            | HTTP 200, `<h1>TaskFlow</h1>`, after 3 s                    | —    |
| 12  | `npm run dev` then `GET /`                              | HTTP 200, `<h1>TaskFlow</h1>`, after 3 s                    | —    |

Additional checks (same day, working tree before the clone):

| Check                                                                             | Result                                                                                           |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| Installed version of each of the 20 direct dependencies equals the pinned version | 20/20 match; no `^`, `~`, `latest`, `beta` or `rc` in `package.json` (only `engines.node`)       |
| `package-lock.json` tracked                                                       | yes                                                                                              |
| `.env` ignored, `.env.example` tracked                                            | yes (`git check-ignore`)                                                                         |
| Volume persistence: row written, `docker compose down`, `up --wait`, row read     | row survived (volume mounted at `/var/lib/postgresql`, PostgreSQL 18.6)                          |
| `compose.yaml` and `ci.yml` parse as YAML (`js-yaml`); `docker compose config -q` | valid; CI has 9 steps, `permissions: contents: read`, triggers `pull_request` and `push`         |
| `npm audit`                                                                       | 9 high, 0 critical; 4 remain with `--omit=dev` (Prisma CLI tree). Recorded in ADR-001, not fixed |

## Not executed

- **CI workflow was not run**: pending remote repository. Only its syntax and the existence of every script it calls were checked.
- **Next.js 16.4.0 advisory coverage** not verified (see ADR-001).

## Orchestration record (TF-01)

| Agent                                                        | Invocations                                 | Detail                                                                                                                                                                   |
| ------------------------------------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Codex (`gpt-6-sol`, medium, `codex exec` unelevated sandbox) | 2 of 4 budgeted                             | `compose.yaml` (35 s, ~11.6k tokens reported) and `ci.yml` (52 s, ~8.1k tokens reported). Diffs reviewed by hand; only the assigned file was created in each worktree    |
| Gemini                                                       | 3 of 3 budgeted                             | `gemini-3.1-pro-high` on ADRs (6 findings); `gemini-3.8-flash-medium` on compose/CI (timed out at 240 s, no usable answer); `gemini-3.8-flash-low` on compose/CI (retry) |
| Claude                                                       | scaffold, versions, spike, ADRs, validation | Not delegated: needs network and `npm install`                                                                                                                           |

Gemini review outcome (cross-checked against evidence, not accepted at face value):

| Finding                                                                   | Verdict                                                                     |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| "`engines` range contradicts 'no ranges'"                                 | Valid; ADR-001 reworded                                                     |
| "`@types/node` 24.19.1 is newer than local Node 24.14.1"                  | Valid as a note; added to ADR-001                                           |
| "Next 16 / Prisma 7 / Vite 8 are fictional"                               | Rejected: all resolve in the npm registry                                   |
| "ADR-002 analyses an excluded option" / "next-auth 4 criteria incomplete" | Taste / already marked "not evaluated"; no change                           |
| "`postgres:18.6` does not exist"                                          | **False**: `docker manifest inspect` found it and the container ran healthy |
| "Wrong PGDATA mount `/var/lib/postgresql`"                                | **False for PostgreSQL 18**: data persisted across `down`/`up`              |
| "`actions/checkout@v7` / `setup-node@v7` do not exist"                    | **False**: GitHub API returned v7.0.1 (2026-07-20) and v7.1.0 (2026-10-08)  |

Lesson: Gemini's knowledge predates these releases; its factual claims about versions are not evidence.

## Post-audit simplification — 2026-10-09

Applied the verified findings of the over-engineering audit (4 direct dependencies, 4 files and 2 scripts removed). Working-tree checks after the change, before commit:

| Command                                                                                            | Result                                                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`, `npm run typecheck`, `npm test` (3 tests), `npm run build`, `npm run format:check` | all exit 0                                                                                                                                                                                               |
| `npm run db:validate` without a `.env` file (CI case)                                              | exit 0                                                                                                                                                                                                   |
| `npm run db:migrate` with `.env` present                                                           | Prisma read `DATABASE_URL` through `process.loadEnvFile()` (datasource shown); the connection then failed with P1001 because Docker Desktop was stopped, so the full migrate run was **not** re-verified |
| `next build` leaves `tsconfig.json` unchanged                                                      | yes, with the original `lib`/`allowJs` kept                                                                                                                                                              |

Not verified: that `prisma/migrations` is Prisma 7's default migrations path (the explicit setting was kept), and a fresh-clone `npm ci` after this change (see next entry).

Fresh clone of commit `aacccc8` (2026-10-09): `npm ci` 61 s, `lint`, `format:check`, `typecheck`, `test` (3 passed), `db:validate` and `build` all exit 0. Direct dependencies: 6 production + 10 development, none with a version range. The full PostgreSQL migrate run remains un-reverified until Docker is running.
