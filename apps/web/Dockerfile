# --------- Builder ---------
FROM node:20-alpine AS builder
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

# Copy workspace manifests first for better layer caching.
COPY package.json pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/shared/package.json packages/shared/

RUN pnpm install --frozen-lockfile=false

# Copy source.
COPY . .

# Stubs needed so the lazy db Proxy / Drizzle adapter can read descriptors
# during `next build`. postgres-js is lazy so no real DB call happens.
ENV DATABASE_URL=postgres://stub:stub@stub:5432/stub \
    REDIS_URL=redis://stub:6379 \
    AUTH_SECRET=build-time-stub-replace-at-runtime \
    APP_SECRET=build-time-stub-replace-at-runtime \
    MINIO_ENDPOINT=stub \
    MINIO_PORT=9000 \
    MINIO_USE_SSL=false \
    MINIO_ACCESS_KEY=stub \
    MINIO_SECRET_KEY=stub \
    MINIO_BUCKET=stub \
    NEXT_TELEMETRY_DISABLED=1

RUN pnpm --filter @zora/web build

# --------- Runner ---------
FROM node:20-alpine AS runner
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate
WORKDIR /repo

ENV NODE_ENV=production

COPY --from=builder /repo /repo

EXPOSE 3000

CMD ["pnpm", "--filter", "@zora/web", "start"]
