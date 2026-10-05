using System.Net;
using System.Net.Http.Json;
using System.Net.Sockets;
using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using FluentAssertions;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;

namespace DKNet.Aspire.Hosting.WebsiteHook.Tests;

// DRK-2086 acceptance tests (@integration): start a real AppHost against the website-hook-api and
// website-hook-ui images. Until those images are published, build them locally from the branch:
//   docker build --target api -t ghcr.io/baoduy/website-hook-api:latest src/webhook
//   docker build --target ui  -t ghcr.io/baoduy/website-hook-ui:latest  src/webhook

public class WebsiteHookIntegrationTests
{
    private static readonly TimeSpan StartTimeout = TimeSpan.FromMinutes(3);

    private sealed record CreatedWebhook(string Id, string Url);

    // Scenario: An Aspire AppHost runs the website-hook API
    [Fact]
    [Trait("Category", "Integration")]
    public async Task AnAspireAppHostRunsTheWebsiteHookApi()
    {
        using var cts = new CancellationTokenSource(StartTimeout);
        await using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        var hooks = shopAppHost.AddWebsiteHook("hooks");
        var ordersApi = shopAppHost.AddContainer("orders-api", "ghcr.io/baoduy/website-hook-api", "latest")
            .WithReference(hooks)
            .WithExplicitStart();

        await using var app = await shopAppHost.BuildAsync(cts.Token);
        await app.StartAsync(cts.Token);

        await app.ResourceNotifications.WaitForResourceHealthyAsync("hooks", cts.Token);
        using var client = app.CreateHttpClient("hooks", "http");
        (await client.GetAsync("/openapi.json", cts.Token)).StatusCode.Should().Be(HttpStatusCode.OK);

        var config = await ExecutionConfigurationBuilder.Create(ordersApi.Resource)
            .WithEnvironmentVariablesConfig()
            .BuildAsync(
                app.Services.GetRequiredService<DistributedApplicationExecutionContext>(),
                NullLogger.Instance,
                cts.Token);
        config.EnvironmentVariables.Should().Contain(
            new KeyValuePair<string, string>("services__hooks__http__0", "http://hooks.dev.internal:3000"));
    }

    // Scenario: The Aspire resource accepts more creates than the default rate limit
    [Fact]
    [Trait("Category", "Integration")]
    public async Task TheAspireResourceAcceptsMoreCreatesThanTheDefaultRateLimit()
    {
        using var cts = new CancellationTokenSource(StartTimeout);
        await using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        shopAppHost.AddWebsiteHook("hooks");

        await using var app = await shopAppHost.BuildAsync(cts.Token);
        await app.StartAsync(cts.Token);
        await app.ResourceNotifications.WaitForResourceHealthyAsync("hooks", cts.Token);

        using var ordersApi = app.CreateHttpClient("hooks", "http");
        var statuses = new List<HttpStatusCode>();
        for (var i = 0; i < 25; i++)
        {
            using var response = await ordersApi.PostAsync("/api/webhooks", content: null, cts.Token);
            statuses.Add(response.StatusCode);
        }

        statuses.Should().HaveCount(25).And.AllBeEquivalentTo(HttpStatusCode.Created);
    }

    // Scenario: The Aspire resource has no UI unless asked
    [Fact]
    [Trait("Category", "Integration")]
    public async Task TheAspireResourceHasNoUiUnlessAsked()
    {
        using var cts = new CancellationTokenSource(StartTimeout);
        await using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        shopAppHost.AddWebsiteHook("hooks");

        await using var app = await shopAppHost.BuildAsync(cts.Token);
        await app.StartAsync(cts.Token);
        await app.ResourceNotifications.WaitForResourceHealthyAsync("hooks", cts.Token);

        app.ResourceNotifications.TryGetCurrentState("hooks", out _).Should().BeTrue();
        app.ResourceNotifications.TryGetCurrentState("hooks-ui", out _).Should().BeFalse();
        app.Services.GetRequiredService<DistributedApplicationModel>().Resources
            .Should().NotContain(r => r.Name == "hooks-ui");
    }

    // Scenario: The Aspire UI option adds a linked UI
    // The spec's host port 8080 is pinned by WebsiteHookModelTests.WithUI_Port8080_BindsHostPort8080ToTargetPort3000;
    // here a free host port stands in for it, so the test cannot collide with whatever already holds 8080.
    [Fact]
    [Trait("Category", "Integration")]
    public async Task TheAspireUiOptionAddsALinkedUi()
    {
        using var cts = new CancellationTokenSource(StartTimeout);
        // The testing builder randomizes host ports unless told not to; this scenario needs the one it asked for.
        await using var shopAppHost = DistributedApplicationTestingBuilder.Create("--DcpPublisher:RandomizePorts=false");
        var uiPort = FreeTcpPort();
        shopAppHost.AddWebsiteHook("hooks").WithUI(port: uiPort);

        await using var app = await shopAppHost.BuildAsync(cts.Token);
        var uiRunningWhileHooksHealthy = WatchUiStartAsync(app, cts.Token);
        await app.StartAsync(cts.Token);

        (await uiRunningWhileHooksHealthy).Should().BeTrue("hooks-ui must start only after hooks is healthy");

        using var api = app.CreateHttpClient("hooks", "http");
        using var created = await api.PostAsync("/api/webhooks", content: null, cts.Token);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var webhook = (await created.Content.ReadFromJsonAsync<CreatedWebhook>(cts.Token))!;

        app.GetEndpoint("hooks-ui", "http").Should().Be(new Uri($"http://localhost:{uiPort}"));
        using var mia = new HttpClient { BaseAddress = new Uri($"http://localhost:{uiPort}") };
        (await mia.GetAsync("/", cts.Token)).StatusCode.Should().Be(HttpStatusCode.OK);
        using var seen = await mia.GetAsync($"/api/webhooks/{webhook.Id}", cts.Token);
        seen.StatusCode.Should().Be(HttpStatusCode.OK);
        (await seen.Content.ReadFromJsonAsync<CreatedWebhook>(cts.Token))!.Id.Should().Be(webhook.Id);
    }

    private static int FreeTcpPort()
    {
        using var listener = new TcpListener(IPAddress.Loopback, 0);
        listener.Start();
        return ((IPEndPoint)listener.LocalEndpoint).Port;
    }

    // Completes with whether "hooks" was already healthy when "hooks-ui" first reported Running.
    private static async Task<bool> WatchUiStartAsync(DistributedApplication app, CancellationToken ct)
    {
        var hooksHealthy = false;
        await foreach (var e in app.ResourceNotifications.WatchAsync(ct))
        {
            if (e.Resource.Name == "hooks")
            {
                hooksHealthy = e.Snapshot.HealthStatus == Microsoft.Extensions.Diagnostics.HealthChecks.HealthStatus.Healthy;
            }
            else if (e.Resource.Name == "hooks-ui" && e.Snapshot.State?.Text == KnownResourceStates.Running)
            {
                return hooksHealthy;
            }
        }

        return false;
    }
}
