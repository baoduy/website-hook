using FluentAssertions;

namespace DKNet.Tests.WebsiteHook.Tests;

public class IntegrationTests
{
    [Fact]
    [Trait("Category", "Integration")]
    public async Task StartAsync_DefaultImage_ReturnsReachableServiceUri()
    {
        await using var container = new WebsiteHookBuilder().Build();

        await container.StartAsync();

        var uri = container.GetServiceUri();
        uri.Scheme.Should().Be("http");

        using var client = new HttpClient { Timeout = TimeSpan.FromSeconds(10) };
        var response = await client.GetAsync(uri);

        response.Should().NotBeNull();
    }
}
