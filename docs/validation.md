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

Clean clone of commit `f48466a` (branch `tf-02/auth`) against a fresh PostgreSQL volume, with CI-style placeholder variables and no `.env`: `npm ci`, `lint`, `format:check`, `typecheck`, `db:validate`, `db:migrate` (applied the migration from an empty database), `npm test` (13 passed) and `build` all exit 0. A scan of every commit found none of the secret values from the local `.env`.

## TF-03 — domain schema and projects, 2026-10-09 (branch `tf-03/projects`)

Checks without `.env`, with the CI placeholder variables, against the Compose PostgreSQL: `lint`, `format:check`, `typecheck`, `db:validate`, `db:migrate` (applies `..._auth` and `..._domain`), `npm test` (5 files, 33 tests) and `build` all exit 0; routes added: `/projects`, `/projects/[projectId]`, `/api/projects`, `/api/projects/[projectId]`. The migration SQL declares `ON DELETE NO ACTION` on both composite foreign keys.

| Acceptance criterion (plan)                                                  | Evidence                                                                                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project is born with owner as ADMIN member and four columns at positions 0–3 | "creates the project, the owner's ADMIN membership and four ordered columns"                                                                       |
| A failure rolls everything back                                              | "leaves nothing behind when creating the columns fails": a trigger raises an error while columns are inserted; no project and no membership remain |
| A project of someone else is not revealed                                    | "does not reveal a project to someone outside it": 404 on read and delete, absent from the list                                                    |
| Deleting a project with an assigned task returns 204 and leaves no orphans   | "deletes the project with its tasks, columns and members, and keeps the users"                                                                     |
| `prisma validate` and a non-empty migration                                  | both checked                                                                                                                                       |

Also covered: validation (empty or oversized name, oversized description, unknown `ownerId`, malformed JSON), 401 on all four project endpoints, foreign or missing `Origin` on writes, ADMIN/MEMBER/VIEWER members can read but get 403 on delete, stale version 409, cursor pagination and the 50-item cap, and the permission table (`tests/unit/policies.test.ts`).

Mutation checks (each made one test fail, then reverted): delete without the version check, non-atomic creation, visibility without the membership filter.

Live check (production build, session created with the test helpers): anonymous `/projects` and `/projects/<id>` redirect (307) to `/login` and `/api/projects` returns 401; signed in, `/projects` (200) lists the project and the creation form, `/projects/<id>` (200) shows its name and description, an unknown id is 404. The test data was removed afterwards.

Not covered yet: the browser flow of the creation form (no end-to-end test until Playwright), rate limiting, and the manual real GitHub login of TF-02.

## TF-04 — members, settings and the permission matrix, 2026-10-09 (branch `tf-04/members`)

Checks without `.env`, with the CI placeholder variables, against the Compose PostgreSQL: `lint`, `format:check`, `typecheck`, `db:validate`, `db:migrate`, `npm test` (7 files, 144 tests) and `build` (adds `/projects/[projectId]/settings`, `/api/projects/[projectId]/members` and `/members/[userId]`) all exit 0.

| Acceptance criterion (plan)                                       | Evidence                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Registered collaborator can access                                | "gives the new member access and never exposes emails or public IDs"                                                                                                                                                                                          |
| VIEWER cannot write                                               | matrix: PATCH/DELETE project, POST/PATCH/DELETE members → 403 for viewer (and member)                                                                                                                                                                         |
| ADMIN cannot raise to ADMIN                                       | matrix: "POST member as ADMIN", "PATCH member to ADMIN", "PATCH an ADMIN down", "DELETE an ADMIN" → 403 for admin, 2xx for owner                                                                                                                              |
| Removal un-assigns tasks and revokes access                       | "un-assigns their tasks, keeps the author, and ends their access" (the removed user's old session gets 404)                                                                                                                                                   |
| Full matrix, all routes × actors, DB unchanged on every rejection | `tests/integration/permissions-matrix.test.ts`: 14 routes × 6 callers (owner, admin, member, viewer, stranger, anonymous) = 84 cases, plus a cross-project target; each rejected request is checked against a snapshot of project, members, tasks and columns |

Also covered: unknown or malformed `publicId`, `OWNER` as a role, unexpected fields, duplicate member, the five-member limit, stale versions on rename/add/change/remove (409, nothing changes), two writes with the same version (one wins, one 409, version +1), a demotion that committed first is honoured, project PATCH trimming and clearing the description, and the policy tables (`tests/unit/policies.test.ts`).

Mutation checks (each made tests fail, then reverted): ADMIN allowed to touch ADMINs (8 failures), removal without un-assigning tasks (3), the lock open to non-members (12), no version check (5).

Browser walkthrough (production build, test session injected as a cookie, built-in browser): the settings page renders; renaming shows "Saved." and the version rises; adding the guest by public ID lists them; changing their role to Viewer persists (confirmed in the database); removing them leaves only the owner; deleting the project with the typed name redirects to `/projects`; the creation form creates a project and opens it. All test data was removed afterwards.

Known limits: the pages are unstyled (UI work comes later), there is no end-to-end test in CI yet (Playwright), and rate limiting is still pending.

## First CI run on GitHub — 2026-10-09

Commit `d33c994` (first push). The run **failed in "Initialize containers"** with "Docker pull failed with exit code 1" (retried three times) before any workflow step ran, so lint, tests and build have still **not** run on GitHub. `postgres:18.6` exists (`docker manifest inspect`). Cause not confirmed; to be re-checked on the next push.

**Update, same day:** the next push (`6f21a2d`, merge of TF-04) ran green on GitHub Actions in 53 s: all 13 steps succeeded, including lint, formatting, typecheck, Prisma validation, the test-helper guard, migrations against the service PostgreSQL, the 144 tests and the build (https://github.com/IgnisCreator/Taskflow/actions/runs/37996388559). The earlier failure was a transient image pull problem; nothing in the workflow changed. This closes the open item of TF-01 (CI executed).

## TF-02 manual check — real GitHub login, 2026-10-09

The owner signed in with GitHub on the local development server and created the project "proyecto base"; screenshots of its settings page (owner listed as the signed-in user) and of the project list were shared. This closes the only open criterion of TF-02 ("real login works locally"). Logout was not part of the evidence; it is covered by the automated test.

## Visual layer (Tailwind), 2026-10-09 (branch `ui/tailwind`)

`lint`, `format:check`, `typecheck`, `npm test` (144 passed) and `build` exit 0; the CSS bundle contains the shared classes. Browser check on the production build with a test session: login, projects list, and settings render styled on desktop; at 375 px the settings page has no horizontal scroll (`scrollWidth` 375 = `innerWidth`). Test data was removed and the owner's real project was left untouched.

Not covered: contrast and keyboard-order audits, other browsers, the project page and profile on mobile.

Process note: from this point validation clones use a separate database (not `docker compose down -v`), because the development database now holds real data.

## Design system and dark theme, 2026-10-09 (branch `ui/design-system`)

Contrast was computed before choosing the values: every pair passed on the first selection. After the change: `lint`, `format:check`, `typecheck`, `npm test` (195 tests, 8 files) and `build` pass; the 51 new tests cover token parity, Tailwind exposure and contrast in both themes. Mutation checks: making one dark copy differ, or lightening the control border, makes the matching tests fail. The new CI guard rejects raw colours (it flags a planted `bg-indigo-600`).

Browser check (production build, test session): with no cookie the page follows the system (the pane's system theme is dark, shown as "Theme: Auto"); the button cycles to Light and the choice survives a reload, rendered by the server (`data-theme="light"` in the HTML, none for Auto); Dark renders cards, inputs, the primary button, and the red delete zone readably. Test data was removed; the owner's real project was untouched.

Not covered: a screen-reader pass, touch-target size, other browsers, and the board (not built yet).

## TF-05 — tasks and the board, 2026-10-09 (branch `tf-05/tasks`)

Checks without `.env`, with the CI placeholder variables: `lint`, `format:check`, `typecheck`, `db:validate`, `db:migrate` (no new migration: the `Task` table exists since TF-03), `npm test` (11 files, 269 tests) and `build` all exit 0; new routes `/api/projects/[projectId]/board`, `/tasks` and `/tasks/[taskId]`.

| Acceptance criterion (plan)                          | Evidence                                                                                                                                                                |
| ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Create, edit and delete persist                      | "adds it at the end of its column and records the author", "changes only the given fields...", "removes it and closes the gap in its column"                            |
| Retrying with the same id gives 200 and a single row | "is safe to retry...", and the concurrent twin-request test                                                                                                             |
| Rejects an external column or assignee               | "rejects a column that belongs to another project" (`INVALID_COLUMN`), "rejects an assignee who is not a member" (`INVALID_ASSIGNEE`), both with the database unchanged |
| The due date does not change with the time zone      | "keep their day in the %s time zone" for UTC, America/Santiago and Pacific/Kiritimati (API, raw SQL and the board response)                                             |

Also covered: author, project, position and column cannot be set by the client (400), title and description limits, bad priorities and dates (including month 13), the 200-task limit, task ids from another project (404 on create, edit and delete), stale versions (409, nothing changes), the snapshot (order, members without emails, version), and the permission matrix extended with the board and task routes (109 cases now).

A unit test found a real bug during this milestone: `isCalendarDate("2026-13-01")` threw instead of returning false, which would have been a 500 rather than a 400. Fixed and covered at both levels.

Mutation checks (each made tests fail, then reverted): VIEWER allowed to write (4), no idempotent replay (2), task lookup without the project (1), no gap closing after delete (1), due date read in local time (1).

Browser walkthrough (production build, test sessions, built-in browser): the board shows four columns with priority, due date and assignee on each card; "Add task" opens the dialog; creating a task with priority, assignee and date shows its card; editing the title and priority updates it; deleting removes it; the database ended at version 3 with the right rows. A VIEWER sees no "Add task" button and a read-only dialog with only "Close". On a 375 px screen the page has no horizontal scroll. The first screenshot showed the dialog stuck to the top-left corner (the reset of Tailwind removes the native `margin: auto`); fixed in `.dialog` and checked again. Test data was removed; the owner's real project was untouched.

Not covered: moving tasks (TF-06), filters and search (TF-07), a conflict walkthrough with two browsers (the 409 path is covered by API tests), end-to-end tests in CI, rate limiting, and an accessibility audit of the dialog with a screen reader.

## TF-06 — moving tasks, drag and drop, polling and conflicts, 2026-10-09 (branch `tf-06/move`)

Checks with the CI placeholder variables: `lint`, `format:check`, `typecheck`, `db:validate`, `db:migrate` (no new migration), `npm test` (13 files, 314 tests), `build` and `npm run test:e2e` (9 browser tests, three consecutive runs identical) all pass. New routes: `PATCH /api/projects/[projectId]/tasks/[taskId]/move` and `GET /api/projects/[projectId]/version`.

| Acceptance criterion (plan)                                   | Evidence                                                                                                                                                                           |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Two clients with the same version do not overwrite each other | "lets exactly one win; the other gets 409, and the order stays valid": statuses [200, 409], version +1, positions contiguous                                                       |
| The order is stable after a reload                            | "dragging a task onto another one ... survives a reload" (real pointer drag, then a reload and a direct read of the API)                                                           |
| After an error the UI is consistent                           | E2E: after a lost connection, after a 500, after a real 409, and with no connection at all, the page shows the server's order (compared with `GET /board`) and the next move works |
| Polling picks up another user's change                        | E2E with a controlled clock: another user moves a task, 11 simulated seconds pass, the board shows it with a notice, no reload                                                     |

Also covered: first, last and middle positions inside a column; to another column at the start, middle and end; into an empty column and out of a column that becomes empty; the exact boundary (`last + 1` is rejected, `last` is accepted); a move that changes nothing keeps the version; negative, fractional and unexpected fields; a column or task of another project; a stale version; the permission matrix (121 cases: viewers 403, strangers 404, anonymous 401 for move and version); a randomised 60-move test against the pure model; unit tests of the model (19); the dialog keeping typed text across a conflict and saving on the second try; moving from the dialog without dragging.

Mutation checks (each made tests fail, then reverted): wrong range bound when moving down, no-op move not rolled back, source gap not closed, destination room not opened, index bound off by one, offline refresh not skipped, optimistic order not dropped on failure, dialog not adopting the current version. One mutation (index bound off by one) **survived** at first because the tests only tried a far-out index; a boundary test was added and now catches it.

Real problems found while testing: (1) with the connection fully lost, `router.refresh()` made Next navigate away to the browser error page; fixed by refreshing only when the server answered; (2) my first drag test reloaded before the request finished, a race in the test, fixed by waiting for the response.

Visual check: a screenshot in the middle of a drag shows the original card faded, the floating card over the target column, and the column outlined with the primary colour.

Not covered: dragging by touch and by keyboard in the browser tests (the sensors are enabled; the keyboard and screen-reader path relies on the dialog controls, which are tested), conflicts between two real browsers beyond the simulated ones, a screen-reader pass, and the filters (TF-07). The Playwright download is large (about 720 MB for Chromium, its headless shell and ffmpeg in the user cache).

## TF-07 — filters, search, empty/error states, keyboard, 2026-10-09 (branch `tf-07/filters`)

Checks with the CI placeholder variables: `lint`, `format:check`, `typecheck`, `npm test` (14 files, 321 tests), `build` and `npm run test:e2e` (12 browser tests) pass. No new migration (the two indexes came with TF-03).

| Acceptance criterion (plan)                      | Evidence                                                                                                                                                   |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Combinable filters and search, in SQL            | `tests/integration/filters.test.ts`: search in title and description ignoring case, priority, assignee, unassigned, AND combinations, order kept           |
| Indexes explained with a real `EXPLAIN`          | ADR-008 (plan with and without `enable_seqscan`)                                                                                                           |
| Main flow with the keyboard only                 | E2E "keyboard only": type in Search, Enter, focus card, Enter, change the column select with the arrow key, "Move to end" with Enter; server order checked |
| Drag disabled with filters; move goes to the end | same E2E (`aria-disabled="true"` on the card, "1 of 3" badge, Alpha ends last in "In progress")                                                            |
| Empty and error states                           | E2E "no results" (also with an invalid priority in the URL, ignored); `src/app/error.tsx`                                                                  |
| Responsive                                       | E2E at 375 px: no horizontal scroll, screenshot checked (filters wrap, columns stack)                                                                      |

Real problem found: searching `_` or `%` returned every task (Prisma does not escape `ILIKE` wildcards); fixed and covered.

Mutation checks (each made a test fail, then reverted): no wildcard escaping (1 test), drag not disabled while filtered (E2E; the first attempt was invalid because the E2E runs a production build and I had not rebuilt, the second one, rebuilt, failed as expected).

Not covered: a screen-reader pass, touch and keyboard drag in the browser tests, a combined filter by text and a tab in a second browser, creating a task while a filter hides it (it is created, and may not show until the filter is cleared).

## Landing page, 2026-10-09 (branch `tf-07b/landing`)

`/` is now a landing page: what TaskFlow does, an explanation of Kanban (origin, an example board, three principles; it says plainly that TaskFlow does not enforce per-column limits), and a button that depends on the session ("Go to your projects" or "Sign in with GitHub"). The header is sticky and shows "Sign in" to anonymous visitors. Checked with an E2E test (both session states, no horizontal scroll at 375 px) and screenshots in light, dark and phone width. Only design tokens are used (the colour guard passes).

## Email login with confirmation, 2026-10-10 (branch `tf-09/email-login`)

Checks: `lint`, `format:check`, `typecheck`, `npm test` (15 files, 325 tests), `build`, `npm run test:e2e` (15 browser tests) pass.

- Integration (`tests/integration/email-login.test.ts`, the mailbox is a mock of `sendEmail`): sign-up sends one link and creates no session; sign-in before confirming is 403 with no session and sends a new link; opening the link marks the user verified and sign-in then works (`/api/me` returns the user); a wrong password is 401; a made-up token is rejected; a short password is 400.
- Mutation check: `requireEmailVerification: false` makes the "refused until confirmed" test fail; reverted.
- E2E: a confirmed user signs in and lands on `/projects`; the form creates the account and shows the confirmation notice with the address; signing in unconfirmed shows the same notice and `/projects` still redirects to `/login`; a wrong password shows an error.
- **Not covered:** a real email delivered by Resend (no key was used, as agreed); clicking the link in a real browser (covered at API level); "forgot password"; the rate limiter. The production E2E server logs "RESEND_API_KEY is not set" because the build runs in production mode; the test still passes, and the log is the failure mode described in ADR-009.
