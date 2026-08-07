# website-hook

The webhook API for AI webhook integration testing. Create a capture webhook, point any
external system at its unique URL, and inspect every request it sends — method, path,
query, headers, and body — with no UI and no accounts. Idle webhooks purge themselves
after 7 days.

## API

```
POST   /api/webhooks                               → 201 { id, url, createdAt, expiresAt }
GET    /api/webhooks/:id                            → 200 { id, createdAt, lastActivityAt, requestCount, expiresAt } | 404
DELETE /api/webhooks/:id                             → 204 (idempotent)
GET    /api/webhooks/:id/requests?limit=&cursor=     → 200 { items, nextCursor } | 404
GET    /api/webhooks/:id/requests/:requestId         → 200 { id, method, path, query, headers, body, truncated, createdAt } | 404
*      /:id/*path                                    → 200 always, 404 if webhook missing/expired
```

- **Pagination**: `?limit=` (default 20, max 100) and `?cursor=` (the `nextCursor` from the
  previous page, omit for the first page). Results are newest-first.
- **Body encoding**: captured request bodies are opaque bytes, returned as a base64 string
  in the `body` field of both the list and single-request endpoints.
- **Errors**: `404 { error: "not_found" }` for any endpoint referencing a missing/expired/
  deleted webhook; `429 { error: "rate_limited" }` when webhook creation exceeds 20/min/IP.

## Configuration

| Env var   | Default              | Notes                                   |
| --------- | --------------------- | ---------------------------------------- |
| `DB_PATH` | `./data/webhook.db`   | Container default: `/data/webhook.db`. Mount `/data` as a volume for persistence. |

## Running locally

```bash
npm install
npm run dev
```

## Container

```bash
docker build -t website-hook .
docker run -p 3000:3000 -v website-hook-data:/data website-hook
```
