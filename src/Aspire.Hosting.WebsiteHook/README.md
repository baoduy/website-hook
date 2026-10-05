# DKNet.Aspire.Hosting.WebsiteHook

A [.NET Aspire](https://aspire.dev/) hosting integration that runs
[website-hook](https://github.com/baoduy/website-hook) — a webhook receiver you can call and
inspect — as a container in your AppHost.

## Installation

```bash
dotnet add package DKNet.Aspire.Hosting.WebsiteHook
```

## Requirements

- .NET 10.0 or later
- .NET Aspire 13.6 or later
- Docker (or another container runtime Aspire supports)

## Usage

```csharp
var builder = DistributedApplication.CreateBuilder(args);

var hooks = builder.AddWebsiteHook("hooks");

builder.AddProject<Projects.OrdersApi>("orders-api")
    .WithReference(hooks)
    .WaitFor(hooks);

builder.Build().Run();
```

`WithReference(hooks)` gives the referencing project the API address through service discovery
(`services__hooks__http__0`).

### The UI

The Inspector UI is opt-in. `WithUI` adds a second container, `<name>-ui`, listed under the API
resource. It starts once the API is healthy and reaches it through the API's HTTP endpoint.

```csharp
var hooks = builder.AddWebsiteHook("hooks")
    .WithUI(port: 8080);
```

## Default settings

| Setting | API (`AddWebsiteHook`) | UI (`WithUI`) |
| --- | --- | --- |
| Image | `ghcr.io/baoduy/website-hook-api:latest` | `ghcr.io/baoduy/website-hook-ui:latest` |
| Endpoint | `http`, container port `3000` | `http`, container port `3000` |
| Host port | `port` argument; a free port when `null` | `port` argument; a free port when `null` |
| Environment | `DISABLE_RATE_LIMIT=true`, `DISABLE_WEBHOOK_QUOTA=true` | `WEBHOOK_API_URL` = the API's `http` endpoint |
| Health check | `GET /openapi.json` answers `200` | — |

The rate limit and the webhook quota are turned off, so tests can create as many webhooks as
they need.

## Changing the defaults

Use Aspire's own builder methods:

```csharp
var hooks = builder.AddWebsiteHook("hooks")
    .WithImageTag("0.1.0")
    .WithEnvironment("DISABLE_RATE_LIMIT", "false");
```

## Data

The container has no volume and no persistent lifetime: captured webhooks and requests are not
kept when the AppHost restarts.

## API

- `AddWebsiteHook(this IDistributedApplicationBuilder builder, string name, int? port = null)` —
  adds the website-hook API container and returns its `IResourceBuilder<WebsiteHookResource>`.
- `WithUI(this IResourceBuilder<WebsiteHookResource> builder, int? port = null)` — adds the
  `<name>-ui` container and returns the API builder.
- `WebsiteHookResource.PrimaryEndpoint` — the API's `http` endpoint.
