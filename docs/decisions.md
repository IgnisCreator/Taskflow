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
| @dnd-kit/core                                | 6.3.1                                               | 2024-12-05 | Drag and drop for the board (ADR-007); brings `@dnd-kit/accessibility` and `@dnd-kit/utilities`                          |
| @playwright/test                             | 1.64.0                                              | 2026-10-07 | End-to-end tests in a real browser; dev dependency                                                                       |
| tailwindcss / @tailwindcss/postcss           | 4.3.3                                               | 2026-07-16 | Build-time only (dev dependencies); Tailwind 4 with the PostCSS plugin, as in its Next.js guide                          |
| postcss                                      | 8.5.29                                              | 2026-10-05 | Required by `@tailwindcss/postcss`; pinned exactly                                                                       |
| vitest                                       | 5.0.3                                               | 2026-09-30 | Needs `vite` as a non-optional peer                                                                                      |
| vite                                         | 8.3.3                                               | 2026-10-06 | Pinned explicitly because `vitest@5.0.3` requires it (peer `^6.4 \|\| ^7 \|\| ^8`)                                       |
| @types/node                                  | 24.19.1                                             | 2026-10-01 | Matches Node 24                                                                                                          |
| @types/react / @types/react-dom              | 19.3.0                                              | —          |                                                                                                                          |

Removed after the 2026-10-09 audit (no longer direct dependencies): `pg` and `@types/pg` (both are already dependencies of `@prisma/adapter-pg`, so the exact pin of `pg` is now resolved by the lockfile only), `dotenv` (replaced by Node's `process.loadEnvFile()` in `prisma.config.ts`) and `eslint-config-prettier` (0 conflicting active rules with ESLint 9; add it back with any stylistic ESLint plugin). Also removed: `next.config.ts` (empty; re-add for `output: "standalone"` in TF-08), `vitest.config.ts` (re-add with Playwright) and the `db:generate` and `db:migrate:dev` scripts (re-add `db:migrate:dev` in TF-03). `tsconfig.json` keeps `lib` and `allowJs` because `next build` rewrites them anyway.

Deferred in TF-01 and installed later: Better Auth (TF-02, ADR-002), `@dnd-kit/core` and Playwright (TF-06, ADR-007).

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

## ADR-005 — Visual layer and design system (2026-10-09)

- Tailwind CSS 4 is the only styling tool; no component library. The full guide is `docs/design.md`.
- **Four colours by role** (Neutral, Primary, Danger, Success), defined once as CSS variables in `src/app/globals.css` and exposed to Tailwind through `@theme inline`. Pages use roles (`bg-surface`, `text-muted`, `border-line`) and a small set of shared classes (`btn`, `btn-secondary`, `btn-danger`, `field`, `input`, `card`, `card-danger`, `badge`, `link`, `error`, `notice`); no raw Tailwind colours and no `dark:` variants.
- **Dark theme is now in scope.** The original plan left it out of version 1; the owner asked for it on 2026-10-09. It follows the system by default; a header button cycles Auto, Light and Dark and stores the choice in a `theme` cookie that the server renders as `data-theme` on `<html>` (no flash, no inline script). Consequence: the root layout reads cookies, so every route renders dynamically, which is acceptable for an authenticated app.
- **Enforced, not just documented:** a unit test checks WCAG AA contrast for 19 text pairs and 5 control pairs in both themes and that both copies of the dark values match; a CI step rejects raw colour classes in `src/`.
- Mobile first, light and dark, no horizontal scroll at 375 px. Deeper UI work (board, keyboard alternatives to drag, empty and error states, touch-target audit) stays in TF-06 and TF-07.

## ADR-006 — Tasks and the board (TF-05)

- **Date:** 2026-10-09
- **Status:** accepted (TF-05)

### Decision

- **Permissions:** `task:write` (create, edit, assign, delete; move in TF-06) belongs to the owner, ADMIN and MEMBER; a VIEWER only reads. A task of another project is `404` even when the caller belongs to both projects.
- **Writes** go through `withProjectLock` like every other project mutation (ADR-003/004); each bumps `boardVersion` once.
- **Idempotent creation:** the client generates the task `id` (UUID). Repeating a request whose response was lost returns `200` with the existing task, before any version check; a first creation is `201`. An id that belongs to another project is `404`. Two identical requests at once end with a single row (one wins, the other gets 200 or 409). The dialog keeps its draft id while it is open, so retries are safe.
- **Order:** integer positions 0..n-1 per column. A new task goes to the end; deleting one closes the gap in its column. Moving tasks is TF-06.
- **Limits:** at most 200 tasks per project (`409 LIMIT_REACHED`, counted inside the lock); title 1-160, description up to 5000, empty text stored as null.
- **Due dates are calendar dates**, stored as `DATE` and exchanged as `"YYYY-MM-DD"`. They are read as UTC and never converted to local time, so they cannot shift with the time zone of the server (tested in UTC, America/Santiago and Pacific/Kiritimati). Impossible dates, including month 13, are `400`.
- **Assignee and column** must belong to the project (`400 INVALID_ASSIGNEE` / `INVALID_COLUMN`); the composite foreign keys enforce the same in the database.
- **Board snapshot:** `GET /api/projects/:id/board` reads project, members, ordered columns and tasks in one `REPEATABLE READ` transaction, so the data and `boardVersion` come from the same moment. All of it is returned (the 200-task limit makes pagination unnecessary); filters arrive in TF-07.
- **UI:** four fixed columns; a task opens in a native `<dialog>` (focus trap and Esc from the platform) for create, edit, delete or read-only view. A 409 refreshes the board and keeps what the user typed; saving again repeats the intent with the new version. The delete confirmation is the `confirm` of the browser.
- **ESLint:** `no-unused-vars` ignores rest siblings and names that start with an underscore, because dropping a key by destructuring is used deliberately.

## ADR-007 — Moving tasks, drag and drop, polling and failure handling (TF-06)

- **Date:** 2026-10-09
- **Status:** accepted (TF-06)

### Library choice (dnd-kit)

`@dnd-kit/core` 6.3.1 only (no `@dnd-kit/sortable`): the stable line, its peers accept React 19, and the repository is active (last push 2026-09-12) although this package was last released in December 2024. `@dnd-kit/react` 0.5.0 exists but is pre-1.0. Pointer, touch (200 ms press) and keyboard sensors are enabled, and the screen-reader announcements use task and column names instead of ids. Not chosen: native HTML5 drag and drop (no touch support, accessibility would be hand-built).

### Move rules

- `PATCH /api/projects/:id/tasks/:taskId/move` with `{ columnId, toIndex, expectedBoardVersion }`. `toIndex` is the final index in the destination column **not counting the task itself**: 0 is first, the number of other tasks is last. Anything else is `400 INVALID_POSITION`; a column of another project is `400 INVALID_COLUMN`; a task of another project is `404`.
- Under `withProjectLock`, positions stay 0..n-1 in both columns using ranged increments and decrements (there is no unique constraint on position, so there are no transient conflicts). The version goes up once.
- A move that changes nothing throws inside the lock to roll back (version included) and answers 200 with the current state.
- `src/lib/board-order.ts` is a pure model of the same move: the browser uses it for the optimistic update, and a randomised 60-move test checks the database against it after every step.
- `GET /api/projects/:id/version` (any member, never cached) feeds the polling.

### Behaviour of the board

- **Optimistic with rollback.** The order changes at once, with one move in flight at a time. The optimistic order only counts while the server data it was built from is still current, so a refresh replaces it without an effect. On any failure it is dropped.
- **Refresh only when the server answered.** After a conflict, an error response or a success the page refreshes. After a failure with no response at all (offline) it does **not**: the refresh would fail and Next would reload the whole page, leaving the browser error page. An end-to-end test that cuts the connection found this.
- **Polling.** Every 10 s while the tab is visible, and on focus or on becoming visible, the board reads the version and refreshes if it changed (a short notice says so). It pauses while a move is in flight.
- **Dialogs keep their own version.** A dialog saves with the version from when it opened. If the board changed meanwhile, the server answers 409, the typed text stays, the dialog adopts the current version, and a second save repeats the intent knowingly (nothing is overwritten silently).
- **Accessible alternative to dragging.** The task dialog has "Column" and "Position" selects and a "Move" button.
- **End-to-end tests** (`npm run test:e2e`) run against a production build on port 3100 with sessions created by test-only helpers (`tests/e2e/fixtures.ts`; secret and database in `tests/e2e/env.ts`). In CI they run after the build against the service database, after `npx playwright install --with-deps chromium`.

## ADR-008 — Filters and search in SQL (TF-07)

- **Date:** 2026-10-09
- **Status:** accepted (TF-07)

- **In the URL, in SQL.** `?q=&assignee=&priority=` is read by `parseFilter` (each field validated on its own; a bad or repeated value is ignored) and applied as a Prisma `where` on the tasks of `getBoard`, inside the same REPEATABLE READ snapshot. Filters combine with AND; search is `ILIKE` on title or description. The form is a plain `GET` form, so it works with the keyboard and survives a reload, and polling keeps the URL.
- **Wildcards are escaped.** Prisma's `contains` becomes `ILIKE` without escaping, so searching `_` or `%` matched every task. The service escapes `\`, `%` and `_`. A test found it.
- **`total` per column.** Each column also reports its unfiltered count (`_count`), used for the "2 of 3" badge and to know the last position.
- **Dragging is off while a filter is active** (the visible order is partial). The task dialog then offers only a column and "Move to end", sent as `toIndex = total of the target column, minus the task itself if it stays in its column`; the page does not show an optimistic order, it waits for the server.
- **Indexes** `(projectId, assigneeId)` and `(projectId, priority)` already exist from TF-03. `EXPLAIN (ANALYZE)` on a project with 200 tasks (rolled-back transaction in the E2E database, PostgreSQL 18.6): the planner picks a sequential scan over the 3-page table (0.05 ms for `priority = 'HIGH'`, 0.12 ms for the `ILIKE` search, 111 of 200 rows matched), and with `enable_seqscan = off` it uses `Task_projectId_priority_idx` (bitmap index scan, 66 rows, 0.05 ms). With the limit of 200 tasks per project the indexes are not needed for speed today; they are cheap and become the plan as soon as the table grows. `ILIKE '%text%'` cannot use a B-tree index at any size (it would need `pg_trgm`, not added: not needed under 200 tasks per project).
- **Error and empty states.** `src/app/error.tsx` (message and "Try again"), "No tasks match these filters." when every column is empty, and a "Clear" link.
