# website-hook Technical Architecture

This document describes how website-hook captures, stores, and serves webhook traffic. It covers both hosting modes — Node.js / Docker and Cloudflare Workers — side by side.

For a quick start, see [`README.md`](../README.md).

## End-to-end capture flow

```
external sender
      │
      │ HTTP (any method)
      ▼
/:id/*path  →  src/webhook/app/[id]/[[...path]]/route.ts
      │
      ├─ 404 if the webhook is missing or expired
      │
      ▼
readBoundedBody()  →  up to 1 MiB, flagged truncated if larger
      │
      ▼
insertCapturedRequest() in src/webhook/lib/db.ts
      │
      ▼
SQLite file (Node/Docker)  or  Cloudflare D1 (Workers)
```

The capture route lives in [`src/webhook/app/[id]/[[...path]]/route.ts`](../src/webhook/app/%5Bid%5D/%5B%5B...path%5D%5D/route.ts). It accepts every HTTP method, reads the request body up to [`MAX_BODY_BYTES`](../src/webhook/lib/constants.ts) (1 MiB), and stores the method, path, query string, headers, and opaque body bytes.

> **Capture always returns HTTP 200 to the sender.** If storage fails, the failure is logged but never surfaced to the caller. A missing or expired webhook still returns 404 before any storage attempt.

Each stored request bumps the webhook's `lastActivityAt`, which pushes back the 7-day expiry window. After [`MAX_REQUESTS_PER_WEBHOOK`](../src/webhook/lib/constants.ts) (1,000) requests, the oldest rows are pruned for that webhook.

## Inspector UI and management API flow

The single-page inspector at `/` is implemented in [`src/webhook/components/inspector/inspector.tsx`](../src/webhook/components/inspector/inspector.tsx). It is a browser-only React client that:

1. Remembers created webhook IDs in `localStorage`.
2. Polls the management API every few seconds for new requests.
3. Loads older pages on demand via cursor pagination.

The browser client talks to the public management API under `/api/webhooks/*`:

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/api/webhooks` | Create a new webhook |
| `GET` | `/api/webhooks/:id` | Get webhook metadata and request count |
| `DELETE` | `/api/webhooks/:id` | Delete a webhook and its requests |
| `GET` | `/api/webhooks/:id/requests` | List captured requests (cursor-paginated) |
| `GET` | `/api/webhooks/:id/requests/:requestId` | Fetch a single captured request |

Endpoint request/response shapes are documented in the generated OpenAPI spec at `/openapi.json` and browsable at `/api/reference`.

## Storage layer

One Prisma client factory in [`src/webhook/lib/prisma.ts`](../src/webhook/lib/prisma.ts) serves both runtimes. The code does **not** trust `process.env.NEXT_RUNTIME` because the bundler statically replaces it to `"nodejs"`. Instead, it probes the Cloudflare context for a D1 binding to decide which driver to use.

| | Node.js / Docker | Cloudflare Workers |
|---|---|---|
| **Database** | File-based SQLite (`DB_PATH`) | Cloudflare D1 binding (`env.DB`) |
| **Driver** | Prisma with `datasourceUrl: file:...` | Prisma D1 driver adapter (`@prisma/adapter-d1`) |
| **Runtime detection** | Cloudflare context probe returns no `DB` binding | Cloudflare context probe returns `DB` binding |
| **Where data lives** | Local file on disk, mounted volume in containers | D1 database in your Cloudflare account |

The default SQLite path is `./data/webhook.db` for local development and `/data/webhook.db` in the container image.

## Schema provisioning

| | Node.js / Docker | Cloudflare Workers |
|---|---|---|
| **When** | At runtime on first use | At deploy time |
| **How** | [`ensureSchema()`](../src/webhook/lib/prisma.ts) reads every `prisma/migrations/*/migration.sql` file and executes each statement idempotently. Duplicate-column errors are ignored so the migration can run safely against a partially-migrated database. | The CI workflow runs `npx wrangler d1 migrations apply webhook-db --remote` before deploying the Worker. |
| **Entry point** | [`src/webhook/lib/prisma.ts`](../src/webhook/lib/prisma.ts) | [`.github/workflows/deploy-cf.yml`](../.github/workflows/deploy-cf.yml) |

## Expiry purge

Idle webhooks and their captured requests are deleted after 7 days of inactivity. The actual TTL enforcement is in [`purgeExpiredWebhooks()`](../src/webhook/lib/db.ts); the trigger differs by hosting mode.

| | Node.js / Docker | Cloudflare Workers |
|---|---|---|
| **Trigger** | In-process periodic timer | Cloudflare Workers Cron Trigger |
| **Entry point** | [`register()`](../src/webhook/instrumentation.ts) starts an hourly `setInterval` | [`scheduled()`](../src/webhook/instrumentation.ts) is invoked by the Cron Trigger |
| **Interval** | Hourly | Configured in `wrangler.jsonc` |

Reads also re-check expiry defensively, but purge does not depend on a URL being hit again.

## Configuration

| Env var | Default | Notes |
|---|---|---|
| `DB_PATH` | `./data/webhook.db` (`/data/webhook.db` in containers) | SQLite file location. Ignored on Workers because D1 is used. |
| `DISABLE_RATE_LIMIT` | (disabled) | Set to `"true"`, `"1"`, or `"yes"` to disable the 20/min/IP limit on webhook creation. The default is **rate limiting disabled**; set to `"false"` to enable. |
| `WEBHOOK_QUOTA` | (none) | Maximum active webhooks per IP when quota is enabled. |
| `DISABLE_WEBHOOK_QUOTA` | (disabled) | Set to `"true"`, `"1"`, or `"yes"` to disable the per-IP webhook quota. The default is **quota disabled**; set to `"false"` to enable. |

The rate limiter is an in-memory store per instance, so it is not shared across replicas. Per-IP quota uses the same `getClientIp()` logic as rate limiting.

## Deployment paths

### Docker image and Compose

The container image is built from [`src/webhook/Dockerfile`](../src/webhook/Dockerfile) and published to `ghcr.io/baoduy/website-hook:latest` by [`.github/workflows/publish.yml`](../.github/workflows/publish.yml). It runs the Next.js standalone output under a non-root user and provisions the SQLite schema on startup.

```bash
docker build -t website-hook src/webhook
docker run -p 3000:3000 -v website-hook-data:/data website-hook
```

For persistent configuration, use [`docker-compose.yml`](../docker-compose.yml):

```bash
docker compose up -d
```

### Cloudflare Workers via CI

Pushes to `main` that touch `src/webhook/**` trigger [`.github/workflows/deploy-cf.yml`](../.github/workflows/deploy-cf.yml). The workflow:

1. Builds the Workers bundle with `npm run build:cf`.
2. Applies pending D1 migrations remotely.
3. Deploys the Worker with `npx wrangler deploy`.

The required repository secrets are `CF_API_TOKEN` and `CF_ACCOUNT_ID`.

## .NET Testcontainers module

For .NET integration tests, use the `DKNet.Tests.WebsiteHook` Testcontainers module in [`src/TestContainer.Webhook/`](../src/TestContainer.Webhook/). Its own README documents installation, customization, and the builder API:

→ [`src/TestContainer.Webhook/README.md`](../src/TestContainer.Webhook/README.md)
