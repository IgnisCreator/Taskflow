# Production image of TaskFlow. Build:  docker build -t taskflow .
# Run:    docker run --env-file .env -p 3000:3000 taskflow
# Migrate (release step, before starting the new version):
#   docker build --target migrate -t taskflow-migrate . && docker run --rm -e DATABASE_URL taskflow-migrate
FROM node:24-bookworm-slim AS deps
WORKDIR /app
# The Prisma schema engine (migrations) needs OpenSSL.
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
# Placeholders only so the build can import the code; the real values come at run time.
ENV NEXT_OUTPUT=standalone NEXT_TELEMETRY_DISABLED=1
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build \
    BETTER_AUTH_SECRET=build-placeholder-not-a-secret-0123456789 \
    npm run build

# Applies the migrations and exits. Needs DATABASE_URL (or DIRECT_URL) and nothing else.
FROM build AS migrate
CMD ["npx", "prisma", "migrate", "deploy"]

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "server.js"]
