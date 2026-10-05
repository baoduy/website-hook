# website-hook

The webhook API for AI webhook integration testing. Create a capture webhook and give its
URL to an external system. Inspect the method, path, query, headers, and body of each request
through the API or optional UI. No account is needed. Idle webhooks purge themselves after
7 days by default. Change the period, or turn off expiry, with `WEBHOOK_TTL_DAYS`.

## Repository layout

| Path | Description |
|------|-------------|
| `src/webhook/` | Next.js webhook application, Dockerfile, and Node tests |
| `src/TestContainer.Webhook/` | `DKNet.Tests.WebsiteHook` — Testcontainers module for the container image |
| `src/TestContainer.Webhook.Tests/` | xUnit tests for the Testcontainers module |
| `src/Aspire.Hosting.WebsiteHook/` | `DKNet.Aspire.Hosting.WebsiteHook` — Aspire hosting package |
| `src/Aspire.Hosting.WebsiteHook.Tests/` | Tests for the Aspire hosting package |
| `.github/workflows/publish.yml` | Publishes the API and UI container images |
| `docker-compose.yml` | Docker Compose deployment configuration |

## Documentation

- [`docs/architecture.md`](./docs/architecture.md) — end-to-end technical overview: capture flow, storage layer, schema provisioning, expiry purge, configuration, and deployment paths.
- [`docs/technical-architecture.md`](docs/technical-architecture.md) — detailed technical architecture: capture flow, inspector UI and management API, storage layer, schema provisioning, expiry purge, configuration, deployment paths, and the .NET Testcontainers module.

## API

```
POST   /api/webhooks                               → 201 { id, url, createdAt, expiresAt }
GET    /api/webhooks/:id                            → 200 { id, createdAt, lastActivityAt, requestCount, expiresAt } | 404
DELETE /api/webhooks/:id                             → 204 (idempotent)
GET    /api/webhooks/:id/requests?limit=&cursor=     → 200 { items, nextCursor } | 404
GET    /api/webhooks/:id/requests/:requestId         → 200 { id, method, path, query, headers, body, truncated, createdAt } | 404
*      /:id/*path                                    → 200 always, 404 if webhook missing/expired
```

- **Expiry**: `expiresAt` is `null` for a webhook that never expires (`WEBHOOK_TTL_DAYS=0`).
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
| `WEBHOOK_TTL_DAYS` | `7` | Idle days before a new webhook expires. `0` turns off expiry for new webhooks. Any other non-digit value (e.g. `-1`, `abc`, `1.5`) falls back to 7 and logs one warning. Changing this only affects webhooks created afterward — existing webhooks keep the period they were created with. |

## Running locally

```bash
cd src/webhook
npm install
npm run dev
```

## Container

Build the API and UI from the two targets in `src/webhook/Dockerfile`:

```bash
docker build --target api -t website-hook-api src/webhook
docker build --target ui -t website-hook-ui src/webhook
```

Run the API with a persistent `/data` volume, then connect the UI to it on a Docker network:

```bash
docker network create website-hook
docker run -d --name website-hook-api --network website-hook -p 3000:3000 -v website-hook-data:/data website-hook-api
docker run -d --name website-hook-ui --network website-hook -p 8080:3000 -e WEBHOOK_API_URL=http://website-hook-api:3000 website-hook-ui
```

The API is at `http://localhost:3000`. It serves capture URLs, `/api/...`, `/api/reference`,
and `/openapi.json`; `/` and `/status` return `404`. The Inspector and Status pages are at
`http://localhost:8080/` and `http://localhost:8080/status`. The UI forwards other requests
to the API, so capture URLs and the OpenAPI server address use the UI address when called
through it. `WEBHOOK_API_URL` must be an absolute `http` or `https` URL. The UI exits at
startup if it is missing or invalid, and forwarded calls return `502` if the API cannot be
reached. The UI does not trust caller-supplied forwarded IP headers.

The published images are `ghcr.io/baoduy/website-hook-api` and
`ghcr.io/baoduy/website-hook-ui`. The old `ghcr.io/baoduy/website-hook` tags remain, but no
new versions are published from `v0.1.0` onward.

### docker compose

```bash
docker compose up -d
```

[`docker-compose.yml`](docker-compose.yml) starts both services. The API uses host port `3000`
and stores data in `/data`; the UI uses host port `8080` and waits for the API to be healthy.
Edit the file to change API settings or host ports.

## Testcontainers module

The `DKNet.Tests.WebsiteHook` NuGet package wraps the API image in a
[Testcontainers](https://testcontainers.com/) module so .NET tests can spin up a real
instance. Its default is `ghcr.io/baoduy/website-hook-api:latest`, which has no UI.

```bash
cd src/TestContainer.Webhook
dotnet pack
```

### Usage

```csharp
var container = new WebsiteHookBuilder().Build();

await container.StartAsync();

var uri = container.GetServiceUri();
using var client = new HttpClient();
var response = await client.GetAsync(new Uri(uri, "/openapi.json"));

await container.DisposeAsync();
```

### Customization

```csharp
var container = new WebsiteHookBuilder()
    .WithImage("ghcr.io/baoduy/website-hook-api:latest")
    .WithPortBinding(8080, 3000)
    .WithEnvironment("DB_PATH", "/data/webhook.db")
    .WithLabel("test", "example")
    .Build();
```

See [`src/TestContainer.Webhook/README.md`](src/TestContainer.Webhook/README.md) for the full
API and customization options.

## Aspire hosting package

`DKNet.Aspire.Hosting.WebsiteHook` adds the API resource to a .NET 10 AppHost using Aspire
13.6 or later. Its optional `WithUI` adds a second `<name>-ui` resource. See the
[`Aspire package README`](src/Aspire.Hosting.WebsiteHook/README.md) for setup and usage.
