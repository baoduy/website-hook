# syntax=docker/dockerfile:1.4
# Two image targets (DRK-2086): `ui` (Inspector/Status pages + a forwarder to WEBHOOK_API_URL) and
# `api` (the app without the UI pages). `api` is the last stage, so a plain `docker build` gives it.
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM node:${NODE_VERSION}-slim AS source
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate

# Combined build (no role) — the UI image serves its pages from it.
FROM source AS builder
RUN npm run build

# API build: WEBSITE_HOOK_ROLE is inlined by next.config.ts, so "/" and "/status" answer 404.
FROM source AS api-builder
ENV WEBSITE_HOOK_ROLE=api
RUN npm run build

FROM node:${NODE_VERSION}-slim AS ui
WORKDIR /app
ENV NODE_ENV=production

RUN useradd -m -u 10001 appuser

COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static
COPY --from=builder --chown=appuser:appuser /app/scripts/start-ui.mjs ./scripts/start-ui.mjs

USER appuser
EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/status', (r) => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"]

# Fails fast with a message naming WEBHOOK_API_URL when it is missing or invalid.
CMD ["node", "scripts/start-ui.mjs"]

FROM node:${NODE_VERSION}-slim AS api
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/webhook.db
# Next standalone binds HOSTNAME, which Docker sets to the container id; bind every interface so
# the loopback HEALTHCHECK below reaches the server.
ENV HOSTNAME=0.0.0.0

RUN useradd -m -u 10001 appuser \
  && mkdir -p /data \
  && chown -R appuser:appuser /data

# Standalone output: a minimal server.js plus only the node_modules it traced as used.
COPY --from=api-builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=api-builder --chown=appuser:appuser /app/.next/static ./.next/static

# Prisma schema, migrations, and the startup wrapper that provisions the DB before serving.
COPY --from=api-builder --chown=appuser:appuser /app/prisma ./prisma
COPY --from=api-builder --chown=appuser:appuser /app/scripts ./scripts

USER appuser
EXPOSE 3000

# No dedicated health route in scope (spec §3) — a 404 from an unknown id still proves the
# server is up and routing; any received HTTP response counts as healthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/00000000-0000-0000-0000-000000000000', (r) => process.exit(r.statusCode ? 0 : 1)).on('error', () => process.exit(1))"]

CMD ["node", "scripts/start.js"]
