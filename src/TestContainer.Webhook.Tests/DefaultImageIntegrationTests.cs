using System.Net;
using System.Net.Http.Json;
using System.Text;
using FluentAssertions;

namespace DKNet.Tests.WebsiteHook.Tests;

// DRK-2086 acceptance test: the default image is the API-only image. Until it is published, build
// it locally from the branch: docker build --target api -t ghcr.io/baoduy/website-hook-api:latest src/webhook

public class DefaultImageIntegrationTests
{
    private sealed record CreatedWebhook(string Id);

    private sealed record RequestPage(IReadOnlyList<object> Items);

    // Scenario: Testcontainers starts the API image by default
    [Fact]
    [Trait("Category", "Integration")]
    public async Task TestcontainersStartsTheApiImageByDefault()
    {
        using var cts = new CancellationTokenSource(TimeSpan.FromMinutes(3));
        await using var container = new WebsiteHookBuilder().Build();

        await container.StartAsync(cts.Token);

        using var client = new HttpClient { BaseAddress = container.GetServiceUri() };
        using var created = await client.PostAsync("/api/webhooks", content: null, cts.Token);
        created.StatusCode.Should().Be(HttpStatusCode.Created);
        var webhook = (await created.Content.ReadFromJsonAsync<CreatedWebhook>(cts.Token))!;

        using var orderEvent = new StringContent("{\"event\":\"order.created\"}", Encoding.UTF8, "application/json");
        (await client.PostAsync($"/{webhook.Id}", orderEvent, cts.Token)).StatusCode.Should().Be(HttpStatusCode.OK);
        var page = await client.GetFromJsonAsync<RequestPage>($"/api/webhooks/{webhook.Id}/requests", cts.Token);
        page!.Items.Should().HaveCount(1);

        (await client.GetAsync("/", cts.Token)).StatusCode.Should().Be(HttpStatusCode.NotFound);
    }
}
