# syntax=docker/dockerfile:1.4
ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM node:${NODE_VERSION}-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

FROM node:${NODE_VERSION}-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
ENV DB_PATH=/data/webhook.db

RUN useradd -m -u 10001 appuser \
  && mkdir -p /data \
  && chown -R appuser:appuser /data

# Standalone output: a minimal server.js plus only the node_modules it traced as used.
COPY --from=builder --chown=appuser:appuser /app/.next/standalone ./
COPY --from=builder --chown=appuser:appuser /app/.next/static ./.next/static

# Prisma schema, migrations, and the startup wrapper that provisions the DB before serving.
COPY --from=builder --chown=appuser:appuser /app/prisma ./prisma
COPY --from=builder --chown=appuser:appuser /app/scripts ./scripts

USER appuser
EXPOSE 3000

# No dedicated health route in scope (spec §3) — a 404 from an unknown id still proves the
# server is up and routing; any received HTTP response counts as healthy.
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s CMD ["node", "-e", "require('http').get('http://127.0.0.1:3000/00000000-0000-0000-0000-000000000000', (r) => process.exit(r.statusCode ? 0 : 1)).on('error', () => process.exit(1))"]

CMD ["node", "scripts/start.js"]
