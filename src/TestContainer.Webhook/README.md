# DKNet.Tests.WebsiteHook

A [Testcontainers](https://testcontainers.com/) .NET module for the
`ghcr.io/baoduy/website-hook` container image.

## Installation

```bash
dotnet add package DKNet.Tests.WebsiteHook
```

## Requirements

- .NET 10.0 or later
- Docker running on the local machine or an accessible Docker endpoint

## Minimal usage

```csharp
var container = new WebsiteHookBuilder().Build();

await container.StartAsync();

var uri = container.GetServiceUri();
using var client = new HttpClient();
var response = await client.GetAsync(uri);

await container.DisposeAsync();
```

## Customization

```csharp
var container = new WebsiteHookBuilder("ghcr.io/baoduy/website-hook:latest")
    .WithPortBinding(8080, 3000)
    .WithEnvironment("DB_PATH", "/data/webhook.db")
    .WithLabel("test", "example")
    .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(3000)))
    .Build();
```

## Default settings

| Setting | Default |
| --- | --- |
| Image | `ghcr.io/baoduy/website-hook:latest` |
| Internal port | `3000` |
| Wait strategy | HTTP request to `/00000000-0000-0000-0000-000000000000` on port `3000` |

The default wait strategy matches the Dockerfile healthcheck: any HTTP response
from the server (including a 404 from the unknown webhook ID) proves the
container is ready.

## API

- `WebsiteHookBuilder()` — create a builder with default settings.
- `WebsiteHookBuilder(string image)` — create a builder with a custom image.
- `WithImage(string image)` — override the image.
- `WithPortBinding(int hostPort, int containerPort)` — bind a host port.
- `WithEnvironment(string key, string value)` — add an environment variable.
- `WithLabel(string key, string value)` — add a label.
- `WithCommand(params string[] command)` — override the container command.
- `WithEntrypoint(params string[] entrypoint)` — override the container entrypoint.
- `WithVolumeMount(...)` — mount a volume.
- `WithNetwork(...)` — attach to a network.
- `WithResourceMapping(...)` — add a resource mapping.
- `WithOutputConsumer(...)` — capture stdout/stderr.
- `WithWaitStrategy(...)` — override the wait strategy.
- `WithDockerEndpoint(...)` — use a custom Docker endpoint.
- `WithCleanUp(bool)` — control container cleanup.
- `WithCreateContainerModifier(...)` — low-level container parameter modifier.
- `Build()` — validate and create the container.
- `WebsiteHookContainer.GetServiceUri()` — returns the mapped HTTP URI.
