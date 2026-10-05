using Aspire.Hosting;
using Aspire.Hosting.ApplicationModel;
using Aspire.Hosting.Testing;
using FluentAssertions;
using Microsoft.Extensions.Logging.Abstractions;

namespace DKNet.Aspire.Hosting.WebsiteHook.Tests;

// DRK-2086 acceptance tests (@unit): the application model AddWebsiteHook and WithUI build,
// read without starting the AppHost. Environment values are evaluated in publish mode, where an
// endpoint reference renders as Aspire's "{<resource>.bindings.<endpoint>.url}" placeholder.

public class WebsiteHookModelTests
{
    private static async Task<IReadOnlyDictionary<string, string>> EnvironmentOf(IResource resource)
    {
        var result = await ExecutionConfigurationBuilder.Create(resource)
            .WithEnvironmentVariablesConfig()
            .BuildAsync(
                new DistributedApplicationExecutionContext(DistributedApplicationOperation.Publish),
                NullLogger.Instance,
                CancellationToken.None);

        return result.EnvironmentVariables.ToDictionary(kv => kv.Key, kv => kv.Value);
    }

    private static string ImageOf(IResource resource)
    {
        resource.TryGetContainerImageName(out var image).Should().BeTrue();
        return image!;
    }

    private static EndpointAnnotation HttpEndpointOf(IResource resource) =>
        resource.Annotations.OfType<EndpointAnnotation>().Should().ContainSingle(e => e.Name == "http").Subject;

    // Scenario: The Aspire resource turns both limits off itself
    [Fact]
    public async Task TheAspireResourceTurnsBothLimitsOffItself()
    {
        await using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks");

        var env = await EnvironmentOf(hooks.Resource);
        env.Should().Contain("DISABLE_RATE_LIMIT", "true");
        env.Should().Contain("DISABLE_WEBHOOK_QUOTA", "true");
    }

    [Fact]
    public void AddWebsiteHook_RunsTheApiImageWithTheLatestTag()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks");

        hooks.Resource.Should().BeOfType<WebsiteHookResource>();
        hooks.Resource.Name.Should().Be("hooks");
        ImageOf(hooks.Resource).Should().Be("ghcr.io/baoduy/website-hook-api:latest");
    }

    [Fact]
    public void AddWebsiteHook_PrimaryEndpointIsTheHttpEndpoint()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks");

        hooks.Resource.PrimaryEndpoint.EndpointName.Should().Be("http");
        hooks.Resource.PrimaryEndpoint.Resource.Should().BeSameAs(hooks.Resource);
    }

    [Fact]
    public void AddWebsiteHook_HasAHealthCheck()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks");

        hooks.Resource.Annotations.OfType<HealthCheckAnnotation>().Should().ContainSingle();
    }

    // Spec §3: captured data must not be kept when the AppHost restarts.
    [Fact]
    public void AddWebsiteHook_KeepsNoDataAcrossRestarts()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks");

        hooks.Resource.Annotations.OfType<ContainerMountAnnotation>().Should().BeEmpty();
        hooks.Resource.Annotations.OfType<ContainerLifetimeAnnotation>()
            .Should().NotContain(a => a.Lifetime == ContainerLifetime.Persistent);
    }

    // §6a D1: Aspire's own resource-name validation, no custom guard.
    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("1hooks")]
    [InlineData("hooks_1")]
    public void AddWebsiteHook_InvalidName_ThrowsArgumentException(string? name)
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var act = () => shopAppHost.AddWebsiteHook(name!);

        act.Should().Throw<ArgumentException>().Which.ParamName.Should().Be("name");
    }

    // §6a D2 / R4: no port → Aspire picks a free host port; target port is always 3000.
    [Fact]
    public void AddWebsiteHook_NoPort_LetsAspirePickTheHostPort()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks");

        var http = HttpEndpointOf(hooks.Resource);
        http.Port.Should().BeNull();
        http.TargetPort.Should().Be(3000);
        http.UriScheme.Should().Be("http");
    }

    [Fact]
    public void AddWebsiteHook_Port8080_BindsHostPort8080ToTargetPort3000()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks", port: 8080);

        var http = HttpEndpointOf(hooks.Resource);
        http.Port.Should().Be(8080);
        http.TargetPort.Should().Be(3000);
    }

    // §6a D5: Aspire's built-in WithEnvironment overrides the built-in default.
    [Fact]
    public async Task AddWebsiteHook_UserEnvironmentOverride_Wins()
    {
        await using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks")
            .WithEnvironment("DISABLE_RATE_LIMIT", "false");

        var env = await EnvironmentOf(hooks.Resource);
        env.Should().Contain("DISABLE_RATE_LIMIT", "false");
        env.Should().Contain("DISABLE_WEBHOOK_QUOTA", "true");
    }

    // §6a: the image and tag stay changeable through Aspire's built-in options.
    [Fact]
    public void AddWebsiteHook_UserImageTagOverride_Wins()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        var hooks = shopAppHost.AddWebsiteHook("hooks").WithImageTag("0.1.0");

        ImageOf(hooks.Resource).Should().Be("ghcr.io/baoduy/website-hook-api:0.1.0");
    }

    // R2: without WithUI the model holds no "<name>-ui" resource.
    [Fact]
    public void AddWebsiteHook_WithoutUI_AddsNoUiResource()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();

        shopAppHost.AddWebsiteHook("hooks");

        shopAppHost.Resources.Select(r => r.Name).Should().Equal("hooks");
    }

    // §6a D3: called once → one "<name>-ui".
    [Fact]
    public void WithUI_CalledOnce_AddsOneLinkedUiResource()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        var hooks = shopAppHost.AddWebsiteHook("hooks");

        var returned = hooks.WithUI();

        returned.Should().BeSameAs(hooks);
        var ui = shopAppHost.Resources.Should().ContainSingle(r => r.Name == "hooks-ui").Subject;
        ui.Should().BeOfType<WebsiteHookUIResource>();
        ImageOf(ui).Should().Be("ghcr.io/baoduy/website-hook-ui:latest");
    }

    // §6a D3: called twice → Aspire's duplicate-resource exception.
    [Fact]
    public void WithUI_CalledTwice_ThrowsAspireDuplicateResourceException()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        var hooks = shopAppHost.AddWebsiteHook("hooks").WithUI();

        var act = () => hooks.WithUI();

        act.Should().Throw<DistributedApplicationException>().WithMessage("Cannot add resource of type '*' with name 'hooks-ui' because resource of type '*' with that name already exists.*");
    }

    // R3: the UI gets the API address only through Aspire's endpoint reference.
    [Fact]
    public async Task WithUI_PassesTheApiHttpEndpointAsWebhookApiUrl()
    {
        await using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        shopAppHost.AddWebsiteHook("hooks").WithUI();
        var ui = shopAppHost.Resources.Single(r => r.Name == "hooks-ui");

        var env = await EnvironmentOf(ui);

        env.Should().Contain("WEBHOOK_API_URL", "{hooks.bindings.http.url}");
    }

    [Fact]
    public void WithUI_StartsOnlyAfterTheApiIsHealthy()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        var hooks = shopAppHost.AddWebsiteHook("hooks").WithUI();
        var ui = shopAppHost.Resources.Single(r => r.Name == "hooks-ui");

        var wait = ui.Annotations.OfType<WaitAnnotation>().Should().ContainSingle().Subject;
        wait.Resource.Should().BeSameAs(hooks.Resource);
        wait.WaitType.Should().Be(WaitType.WaitUntilHealthy);
    }

    [Fact]
    public void WithUI_IsListedUnderTheApiResource()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        var hooks = shopAppHost.AddWebsiteHook("hooks").WithUI();
        var ui = shopAppHost.Resources.Single(r => r.Name == "hooks-ui");

        var parent = ui.Annotations.OfType<ResourceRelationshipAnnotation>()
            .Should().ContainSingle(r => r.Type == "Parent").Subject;
        parent.Resource.Should().BeSameAs(hooks.Resource);
    }

    // §6a D2 / R4 for the UI resource.
    [Fact]
    public void WithUI_NoPort_LetsAspirePickTheHostPort()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        shopAppHost.AddWebsiteHook("hooks").WithUI();
        var ui = shopAppHost.Resources.Single(r => r.Name == "hooks-ui");

        var http = HttpEndpointOf(ui);
        http.Port.Should().BeNull();
        http.TargetPort.Should().Be(3000);
        http.UriScheme.Should().Be("http");
    }

    [Fact]
    public void WithUI_Port8080_BindsHostPort8080ToTargetPort3000()
    {
        using var shopAppHost = DistributedApplicationTestingBuilder.Create();
        shopAppHost.AddWebsiteHook("hooks").WithUI(port: 8080);
        var ui = shopAppHost.Resources.Single(r => r.Name == "hooks-ui");

        var http = HttpEndpointOf(ui);
        http.Port.Should().Be(8080);
        http.TargetPort.Should().Be(3000);
    }
}
