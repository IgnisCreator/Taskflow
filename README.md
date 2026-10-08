# TaskFlow

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
cp .env.example .env
npm ci
docker compose up -d --wait   # PostgreSQL, ready when its healthcheck passes
npm run db:migrate            # applies migrations explicitly (none yet)
npm run dev                   # http://localhost:3000
```

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
