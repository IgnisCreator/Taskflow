# TaskFlow

[![CI](https://github.com/IgnisCreator/Taskflow/actions/workflows/ci.yml/badge.svg)](https://github.com/IgnisCreator/Taskflow/actions/workflows/ci.yml)

<!-- TODO(owner): project pitch and status badge (English). -->

## Overview

<!-- TODO(owner): what TaskFlow is and who it is for. -->

## Architecture

<!-- TODO(owner): architecture diagram and short description. -->

## Technical decisions

See [`docs/decisions.md`](docs/decisions.md).

<!-- TODO(owner): short rationale per tool. -->

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

| Command                | Purpose                    |
| ---------------------- | -------------------------- |
| `npm run lint`         | ESLint                     |
| `npm run format:check` | Prettier check             |
| `npm run typecheck`    | TypeScript (no emit)       |
| `npm test`             | Unit tests (Vitest)        |
| `npm run db:validate`  | Validate the Prisma schema |
| `npm run build`        | Production build           |

## SQL and indexes

<!-- TODO(owner): queries, indexes and EXPLAIN output (arrives with TF-07). -->

## How AI tools were used

<!-- TODO(owner): honest note on AI assistance. -->

## Limitations

<!-- TODO(owner). -->
