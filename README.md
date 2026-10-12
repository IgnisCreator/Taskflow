# TaskFlow

[![CI](https://github.com/IgnisCreator/Taskflow/actions/workflows/ci.yml/badge.svg)](https://github.com/IgnisCreator/Taskflow/actions/workflows/ci.yml)

<!-- TODO(owner): project pitch and status badge (English). -->

## Overview

<!-- TODO(owner): what TaskFlow is and who it is for. -->

## Architecture

<!-- TODO(owner): architecture diagram and short description. -->

## Technical decisions

<!-- TODO(owner): summary of the main decisions (the detailed records are kept outside the repository). -->

## Requirements

- Node.js 24 (`.nvmrc`)
- npm
- Docker with Compose

## Getting started

```bash
cp .env.example .env         # then fill in the values (see below)
npm ci
docker compose up -d --wait  # PostgreSQL, ready when its healthcheck passes
npm run db:migrate           # applies the migrations explicitly
npm run dev                  # http://localhost:3000
```

### GitHub OAuth app (development)

1. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App.
2. Homepage URL `http://localhost:3000`; Authorization callback URL `http://localhost:3000/api/auth/callback/github`.
3. Put the client ID and a generated client secret in `.env` as `AUTH_GITHUB_ID` and `AUTH_GITHUB_SECRET`, and a random `BETTER_AUTH_SECRET` (32+ characters). Never commit `.env`.

## Scripts

| Command                | Purpose                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------- |
| `npm run lint`         | ESLint                                                                                                  |
| `npm run format:check` | Prettier check                                                                                          |
| `npm run typecheck`    | TypeScript (no emit)                                                                                    |
| `npm test`             | Unit and integration tests (Vitest); needs PostgreSQL running and migrated                              |
| `npm run db:validate`  | Validate the Prisma schema                                                                              |
| `npm run build`        | Production build                                                                                        |
| `npm run test:e2e`     | Browser tests (Playwright); needs a build and PostgreSQL. First time: `npx playwright install chromium` |

### Checks in Docker

The same pipeline as CI runs in containers (Playwright 1.64.0 image with Node 24), so nothing but Docker is needed:

```bash
docker compose run --rm check             # clean clone of the current branch: lint, types, tests, build, E2E
docker compose run --rm check my-branch   # any local branch
docker compose run --rm tools npm ci      # once: install Linux packages for the working-tree container
docker compose run --rm tools node scripts/create-db.mjs
docker compose run --rm tools sh -c "npm run db:migrate && npm test"
```

They use throwaway databases (`taskflow_ci`, `taskflow_test`); `scripts/create-db.mjs` refuses any other name.

## SQL and indexes

<!-- TODO(owner): queries, indexes and EXPLAIN output (arrives with TF-07). -->

## How AI tools were used

<!-- TODO(owner): honest note on AI assistance. -->

## Limitations

<!-- TODO(owner). -->
