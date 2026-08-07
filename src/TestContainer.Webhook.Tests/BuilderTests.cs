using DotNet.Testcontainers.Builders;
using FluentAssertions;

namespace DKNet.Tests.WebsiteHook.Tests;

public class BuilderTests
{
    [Fact]
    public void Build_WithDefaultSettings_UsesDefaultImageAndPort()
    {
        var container = new WebsiteHookBuilder().Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void Build_WithCustomImage_UsesCustomImage()
    {
        const string image = "my-registry/website-hook:custom";

        var container = new WebsiteHookBuilder()
            .WithImage(image)
            .Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void WithImage_EmptyImage_ThrowsArgumentException()
    {
        var act = () => new WebsiteHookBuilder().WithImage(string.Empty);

        act.Should().Throw<ArgumentException>()
            .Which.ParamName.Should().Be(nameof(WebsiteHookConfiguration.ImageName));
    }

    [Fact]
    public void Build_WithInvalidPort_ThrowsArgumentException()
    {
        var builder = new WebsiteHookBuilder()
            .WithPortBinding(8080, 0);

        var act = builder.Build;

        act.Should().Throw<ArgumentException>()
            .Which.ParamName.Should().Be(nameof(WebsiteHookConfiguration.Port));
    }

    [Fact]
    public void WithPortBinding_DoesNotMutateOriginalBuilder()
    {
        var original = new WebsiteHookBuilder();

        var configured = original.WithPortBinding(8080, 3000);

        configured.Should().NotBeSameAs(original);
    }

    [Fact]
    public void WithEnvironment_AddsEnvironmentVariable()
    {
        var container = new WebsiteHookBuilder()
            .WithEnvironment("DB_PATH", "/data/webhook.db")
            .Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void WithLabel_AddsLabel()
    {
        var container = new WebsiteHookBuilder()
            .WithLabel("test", "value")
            .Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void WithCommand_OverridesCommand()
    {
        var container = new WebsiteHookBuilder()
            .WithCommand("node", "scripts/start.js")
            .Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void WithEntrypoint_OverridesEntrypoint()
    {
        var container = new WebsiteHookBuilder()
            .WithEntrypoint("node")
            .Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void WithWaitStrategy_OverridesWaitStrategy()
    {
        var container = new WebsiteHookBuilder()
            .WithWaitStrategy(Wait.ForUnixContainer().UntilHttpRequestIsSucceeded(r => r.ForPort(3000)))
            .Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void WithCleanUp_SetsCleanupFlag()
    {
        var container = new WebsiteHookBuilder()
            .WithCleanUp(true)
            .Build();

        container.Should().NotBeNull();
    }
}
