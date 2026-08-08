# website-hook

The webhook API for AI webhook integration testing. Create a capture webhook, point any
external system at its unique URL, and inspect every request it sends — method, path,
query, headers, and body — with no UI and no accounts. Idle webhooks purge themselves
after 7 days.

## Repository layout

| Path | Description |
|------|-------------|
| `src/webhook/` | Next.js webhook application, Dockerfile, and Node tests |
| `src/TestContainer.Webhook/` | `DKNet.Tests.WebsiteHook` — Testcontainers module for the container image |
| `src/TestContainer.Webhook.Tests/` | xUnit tests for the Testcontainers module |
| `.github/workflows/publish.yml` | Publishes the `ghcr.io/baoduy/website-hook` container image |
| `docker-compose.yml` | Docker Compose deployment configuration |

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

### OpenAPI

- The OpenAPI spec is generated at build time (via `scripts/generate-openapi.mjs`) and served
  at **`/openapi.json`**.
- An interactive API reference UI (Scalar) is available at **`/api/reference`**.

## Configuration

| Env var   | Default              | Notes                                   |
| --------- | --------------------- | ---------------------------------------- |
| `DB_PATH` | `./data/webhook.db`   | Container default: `/data/webhook.db`. Mount `/data` as a volume for persistence. |
| `DISABLE_RATE_LIMIT` | (disabled) | Set to `"true"`, `"1"`, or `"yes"` to disable the 20/min/IP webhook creation limit. |

## Running locally

```bash
cd src/webhook
npm install
npm run dev
```

## Container

```bash
docker build -t website-hook src/webhook
docker run -p 3000:3000 -v website-hook-data:/data website-hook
```

### docker compose

```bash
docker compose up -d
```

Override the default database path, disable rate-limiting, or change the host port by uncommenting
or editing the relevant lines in `docker-compose.yml`.

## Testcontainers module

The `DKNet.Tests.WebsiteHook` NuGet package wraps the website-hook image in a
[Testcontainers](https://testcontainers.com/) module so .NET tests can spin up a real
instance.

```bash
cd src/TestContainer.Webhook
dotnet pack
```

### Usage

```csharp
var container = new WebsiteHookBuilder()
    .WithImage("ghcr.io/baoduy/website-hook:latest")
    .Build();

await container.StartAsync();

var uri = container.GetServiceUri();
using var client = new HttpClient();
var response = await client.GetAsync(uri);

await container.DisposeAsync();
```

### Customization

```csharp
var container = new WebsiteHookBuilder()
    .WithImage("ghcr.io/baoduy/website-hook:latest")
    .WithPortBinding(8080, 3000)
    .WithEnvironment("DB_PATH", "/data/webhook.db")
    .WithLabel("test", "example")
    .Build();
```

See `src/TestContainer.Webhook/README.md` for the full API and customization options.
