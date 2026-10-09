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

## Docker and migrations re-check — 2026-10-09

| Check                                                                            | Result                                                                                                                           |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `docker compose up -d --wait` with the new `name: taskflow-p1`                   | exit 0, container healthy; own network and volume (`taskflow-p1_*`)                                                              |
| `npm run db:migrate` on an empty database                                        | exit 0, "No migration found in prisma/migrations" (`.env` loaded by `process.loadEnvFile()`)                                     |
| Default migrations path: config without `migrations.path` plus a probe migration | Prisma found and applied `prisma/migrations/00000000000000_probe`; the setting was removed (audit point 11). Probe files deleted |
| `docker compose down -v`                                                         | removed only `taskflow-p1_*` resources                                                                                           |

Closes the two items left open on 2026-10-09. The project `name:` was added because a previous Compose project in another folder was also called `taskflow`, and an earlier `down` of this repo removed that project's network.

## TF-02 — authentication, 2026-10-09 (branch `tf-02/auth`)

Run without `.env`, with the same placeholder variables as CI, against the Compose PostgreSQL:

| Command                                                    | Result                                                                                                                                                                              |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run lint`, `format:check`, `typecheck`, `db:validate` | exit 0                                                                                                                                                                              |
| `npm run db:migrate`                                       | applied `..._auth` (4 tables, `publicId` unique, `(providerId, accountId)` unique)                                                                                                  |
| `npm test`                                                 | exit 0, 3 files, 13 tests: env validation (4), proxy redirect (1), GitHub login identity and token encryption (2), session API (3), origin protection (2), test-session fixture (1) |
| `npm run build`                                            | exit 0; routes `/login`, `/profile`, `/api/me`, `/api/auth/[...all]`, proxy                                                                                                         |
| Guard `grep -rnE 'testUtils\|tests/helpers' src`           | no match; also detects a planted violation                                                                                                                                          |
| Production bundle search for test helpers                  | none found                                                                                                                                                                          |

Acceptance criteria of TF-02 (from the consolidated plan):

| Criterion                                                    | Evidence                                                                                                                                  |
| ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Same provider account, second login keeps the same `User.id` | test "keeps the same user and a single account on a second login" (real handler and database; only GitHub's HTTP endpoints are simulated) |
| After logout the old cookie is rejected                      | test "rejects the old cookie after logout"                                                                                                |
| Every protected endpoint without a cookie returns 401        | test "answers 401 without a session cookie" (`/api/me` is the only protected endpoint so far)                                             |
| Real GitHub login works locally                              | **Not run** — manual check by the owner                                                                                                   |

The tests were mutation-checked: disabling logout, or turning token encryption off, makes the matching test fail. The two origin tests failed until the Vitest environment stopped marking the run as a test (see ADR-002).

Live check with the real `.env` (production build, no login completed): `/login` 200; `/profile` without cookie 307 to `/login`; `/api/me` 401; the GitHub authorize URL carries `redirect_uri=http://localhost:3000/api/auth/callback/github`, scope `read:user user:email` and a `state`.

TF-01 gap closed here: the pull request template (`.github/pull_request_template.md`) was missing from TF-01.
