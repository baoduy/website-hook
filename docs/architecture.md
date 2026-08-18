# website-hook architecture

This document describes how [website-hook](../README.md) works end to end — capture, storage, expiry, configuration, and deployment — for anyone picking up the codebase.

## Overview

website-hook is a small, stateful webhook capture service. A caller creates a webhook via the management API, points an external system at its unique URL, and the service records every HTTP request it receives. Requests can be inspected through a React UI or the management API.

The implementation lives in [`src/webhook/`](../src/webhook/). It is a Next.js application that runs two ways:

- **Node.js / Docker** — file-based SQLite via Prisma.
- **Cloudflare Workers** — D1 via the Prisma D1 driver adapter.

The runtime is chosen at the Prisma client boundary, not by branching every route.

## End-to-end capture flow

1. An external sender issues any HTTP method to `/<webhookId>/<path>`.
2. The dynamic route [`app/[id]/[[...path]]/route.ts`](../src/webhook/app/%5Bid%5D/%5B%5B...path%5D%5D/route.ts) handles the request.
3. The handler looks up the webhook with [`getWebhook()`](../src/webhook/lib/db.ts). A missing or expired webhook returns `404`; otherwise processing continues.
4. [`readBoundedBody()`](../src/webhook/lib/http.ts) reads the body up to `MAX_BODY_BYTES` (1 MiB). If the body is larger, the excess is drained so the connection closes cleanly and the stored request is flagged `truncated: true`.
5. The handler captures method, path, query string, headers, body, and truncation flag.
6. [`insertCapturedRequest()`](../src/webhook/lib/db.ts) stores the row in `captured_requests` and trims the oldest rows if the count exceeds `MAX_REQUESTS_PER_WEBHOOK` (1000).
7. [`touchWebhook()`](../src/webhook/lib/db.ts) updates `last_activity_at`, which resets the 7-day expiry clock.
8. The response is always `200`, even if storage fails. Storage errors are logged to stderr and never surfaced to the caller — the capture endpoint is append-only and acknowledges receipt regardless of persistence outcome.

## Inspector UI and management API

The root page ([`app/page.tsx`](../src/webhook/app/page.tsx)) renders the [`Inspector`](../src/webhook/components/inspector/inspector.tsx) React component. It is a browser-side SPA that keeps the list of created webhook IDs in `localStorage` (up to `MAX_REMEMBERED_WEBHOOKS` = 5) and polls the management API every `POLL_INTERVAL_MS` (4 seconds) to refresh counters and request lists.

Key UI pieces:

- [`useWebhooks.ts`](../src/webhook/components/inspector/use-webhooks.ts) — creates, deletes, and hydrates the remembered webhook list.
- [`useRequests.ts`](../src/webhook/components/inspector/use-requests.ts) — polls `/api/webhooks/<id>/requests`, tracks seen IDs, and supports loading older pages via cursor pagination.
- [`RequestDetail`](../src/webhook/components/inspector/request-detail.tsx) — shows method, path, query, headers, and body for the selected request.

Management API endpoints (implemented in [`app/api/webhooks/`](../src/webhook/app/api/webhooks/)):

- `POST /api/webhooks` — create a webhook.
- `GET /api/webhooks/:id` — fetch webhook metadata and request count.
- `DELETE /api/webhooks/:id` — idempotently delete a webhook (cascades to requests).
- `GET /api/webhooks/:id/requests?limit=&cursor=` — cursor-paginated request list, newest first.
- `GET /api/webhooks/:id/requests/:requestId` — fetch a single captured request.

For exact request/response schemas, use the interactive OpenAPI reference at `/api/reference` (served by [`app/api/reference/route.ts`](../src/webhook/app/api/reference/route.ts) from the generated spec produced by [`lib/openapi.ts`](../src/webhook/lib/openapi.ts)). Endpoint shapes are not duplicated here.

## Storage layer

The schema is defined in [`prisma/schema.prisma`](../src/webhook/prisma/schema.prisma):

- `webhooks` — one row per webhook, keyed by UUID, with `created_at`, `last_activity_at`, and `creator_ip`.
- `captured_requests` — one row per captured request, with `webhook_id`, `created_at`, `method`, `path`, `query`, `headers` (JSON string), `body` (BLOB, optional), and `truncated`. It has a foreign key to `webhooks` with `ON DELETE CASCADE` and an index on `webhook_id`.

The client factory in [`lib/prisma.ts`](../src/webhook/lib/prisma.ts) decides the runtime by probing the Cloudflare context for a `DB` D1 binding. `process.env.NEXT_RUNTIME` is not trusted because the bundler statically replaces it to `"nodejs"`.

- **Node.js / Docker**: resolves `DB_PATH` to an absolute path, ensures the parent directory exists, and opens `file:<path>` SQLite via Prisma.
- **Cloudflare Workers**: wraps the D1 binding with the Prisma D1 adapter.

## Schema provisioning

The two hosting modes provision the schema differently:

### Node.js / Docker — runtime, idempotent

- [`scripts/start.js`](../src/webhook/scripts/start.js) runs before `server.js`, reads [`prisma/migrations/0_init/migration.sql`](../src/webhook/prisma/migrations/0_init/migration.sql), and executes each statement.
- [`lib/prisma.ts`](../src/webhook/lib/prisma.ts) also provides [`ensureSchema()`](../src/webhook/lib/prisma.ts), which walks every migration directory under [`prisma/migrations/`](../src/webhook/prisma/migrations/), applies statements in sorted order, and ignores duplicate-column errors so migrations stay idempotent against a partially migrated local database.

### Cloudflare Workers — deploy-time

- D1 migrations are applied remotely during CI by [`.github/workflows/deploy-cf.yml`](../.github/workflows/deploy-cf.yml) (`npx wrangler d1 migrations apply webhook-db --remote`).
- [`wrangler.jsonc`](../src/webhook/wrangler.jsonc) points the D1 binding at [`prisma/migrations/`](../src/webhook/prisma/migrations/) with the pattern `prisma/migrations/*/migration.sql`.
- At runtime in Workers, [`ensureSchema()`](../src/webhook/lib/prisma.ts) is a no-op because the schema is already applied.

## Expiry purge

Webhooks expire 7 days after the last captured request (`TTL_DAYS`). Purge runs in both modes:

### Node.js / Docker

- [`instrumentation.ts`](../src/webhook/instrumentation.ts) registers an hourly `setInterval` that calls [`purgeExpiredWebhooks()`](../src/webhook/lib/db.ts), deleting rows where `last_activity_at` is older than the TTL.
- [`getWebhook()`](../src/webhook/lib/db.ts) also re-checks expiry at read time as a belt-and-suspenders guard.

### Cloudflare Workers

- [`instrumentation.ts`](../src/webhook/instrumentation.ts) exports a `scheduled()` handler.
- [`wrangler.jsonc`](../src/webhook/wrangler.jsonc) wires it to a cron trigger of `0 * * * *` (top of every hour), so the same purge logic runs without relying on a request being served.

## Configuration surface

Environment variables are read in [`lib/constants.ts`](../src/webhook/lib/constants.ts):

| Variable | Default | Effect |
|----------|---------|--------|
| `DB_PATH` | `./data/webhook.db` (container: `/data/webhook.db`) | SQLite file path in Node/Docker mode. |
| `DISABLE_RATE_LIMIT` | unset (rate limit disabled) | Any value except `"false"`, `"0"`, or `"no"` disables the 20/min/IP creation limit. |
| `DISABLE_WEBHOOK_QUOTA` | unset (quota disabled) | Any value except `"false"`, `"0"`, or `"no"` disables the per-IP webhook quota. |
| `WEBHOOK_QUOTA` | `5` when quota is enabled | Effective quota per IP; set to `0` or `"disabled"` to disable. |

Hardcoded limits, also in [`lib/constants.ts`](../src/webhook/lib/constants.ts):

- `MAX_BODY_BYTES` — 1,048,576 bytes (1 MiB) request body cap.
- `TTL_DAYS` — 7 days idle expiry.
- `MAX_REQUESTS_PER_WEBHOOK` — 1,000 stored requests per webhook.
- `CREATE_RATE_LIMIT` — 20 webhook creations per IP per minute (when enabled).
- `MAX_REMEMBERED_WEBHOOKS` — 5 webhooks remembered in the inspector UI.
- `POLL_INTERVAL_MS` — 4,000 ms UI poll interval.

Rate limiting is implemented in [`lib/rateLimit.ts`](../src/webhook/lib/rateLimit.ts) as an in-memory sliding window. It is suitable for a single instance; a shared store would be needed for replicated deployments.

## Deployment paths

### Docker

- [`src/webhook/Dockerfile`](../src/webhook/Dockerfile) builds a multi-stage Node 24 image:
  1. Install dependencies.
  2. Generate Prisma client and build the Next.js standalone output.
  3. Copy the standalone server, static assets, schema, migrations, and [`scripts/start.js`](../src/webhook/scripts/start.js) into a non-root runtime stage.
- The published image is `ghcr.io/baoduy/website-hook:latest`, built by [`.github/workflows/publish.yml`](../.github/workflows/publish.yml).
- [`docker-compose.yml`](../docker-compose.yml) mounts a named volume to `/data` and sets `DB_PATH=/data/webhook.db`.
- The Dockerfile healthcheck hits `http://127.0.0.1:3000/00000000-0000-0000-0000-000000000000`; any HTTP response (including the resulting `404`) proves the server is routing.

### Cloudflare Workers

- [`wrangler.jsonc`](../src/webhook/wrangler.jsonc) configures an `opennextjs-cloudflare` worker, D1 binding, and the hourly cron trigger.
- [`.github/workflows/deploy-cf.yml`](../.github/workflows/deploy-cf.yml) runs `npm run build:cf`, applies D1 migrations, and deploys with `wrangler deploy`.
- Workers credentials (`CF_API_TOKEN`, `CF_ACCOUNT_ID`) are expected as repository secrets.

## .NET Testcontainers module

For integration testing from .NET, the repository includes a Testcontainers module in [`src/TestContainer.Webhook/`](../src/TestContainer.Webhook/). See [`src/TestContainer.Webhook/README.md`](../src/TestContainer.Webhook/README.md) for installation, defaults, and the fluent builder API — it is not duplicated here.
