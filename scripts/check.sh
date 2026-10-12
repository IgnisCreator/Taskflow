#!/usr/bin/env bash
# The CI pipeline in a clean clone, inside Docker:
#   docker compose run --rm check            # the branch checked out on the host
#   docker compose run --rm check <branch>   # any local branch
# Uses the throwaway database taskflow_ci; never the development database.
set -euo pipefail
git config --global --add safe.directory '*'
branch="${1:-$(git -C /repo rev-parse --abbrev-ref HEAD)}"
git clone -q --branch "$branch" /repo /work
cd /work
echo "== $branch @ $(git rev-parse --short HEAD)"
npm ci --no-audit --no-fund --loglevel=error
node scripts/create-db.mjs --reset
npm run lint
npm run format:check
npm run typecheck
npm run db:validate
bash scripts/guards.sh
npm run db:migrate
npm test
npm run build
npm run test:e2e
echo "== all checks passed on $branch"
