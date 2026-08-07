using DotNet.Testcontainers.Images;
using FluentAssertions;

namespace DKNet.Tests.WebsiteHook.Tests;

// QC verification (DRK-226): independent assertions of the spec-critical behaviors
// not directly covered by the module's own BuilderTests — default config provenance,
// builder immutability on image override, the two image-constructor entry points,
// immutable configuration merge semantics, and the port validation boundary.

public class QcVerificationTests
{
    [Fact]
    public void Defaults_MatchDeployedImageAndDockerfilePort()
    {
        WebsiteHookConfiguration.DefaultImageName.Should().Be("ghcr.io/baoduy/website-hook:latest");
        WebsiteHookBuilder.WebsiteHookImage.Should().Be(WebsiteHookConfiguration.DefaultImageName);
        WebsiteHookConfiguration.DefaultPort.Should().Be(3000);
        WebsiteHookBuilder.WebsiteHookPort.Should().Be(WebsiteHookConfiguration.DefaultPort);

        var config = new WebsiteHookConfiguration();

        config.ImageName.Should().Be(WebsiteHookConfiguration.DefaultImageName);
        // Port is materialized through the builder's Init()/WithPortBinding, not the bare
        // config (it is intentionally null until a binding is applied); the readiness
        // integration test proves the built container runs on the default port.
        config.Port.Should().BeNull();
    }

    [Fact]
    public void WithImage_ReturnsNewBuilder_OriginalUnchanged()
    {
        var original = new WebsiteHookBuilder();
        var originalImage = original.Build().Image.FullName;

        var configured = original.WithImage("my-registry/website-hook:custom");

        configured.Should().NotBeSameAs(original);
        configured.Build().Image.FullName.Should().Contain("my-registry/website-hook:custom");
        original.Build().Image.FullName.Should().Be(originalImage);
    }

    [Fact]
    public void Builder_StringImageConstructor_BuildsContainer()
    {
        var container = new WebsiteHookBuilder("my-registry/website-hook:custom").Build();

        container.Should().NotBeNull();
        container.Image.FullName.Should().Contain("my-registry/website-hook:custom");
    }

    [Fact]
    public void Builder_IImageConstructor_BuildsContainer()
    {
        var image = new DockerImage("ghcr.io/baoduy/website-hook:latest");

        var container = new WebsiteHookBuilder(image).Build();

        container.Should().NotBeNull();
    }

    [Fact]
    public void Configuration_Merge_NewValueOverridesOld()
    {
        var old = new WebsiteHookConfiguration(imageName: "old:1", port: 3000);
        var @new = new WebsiteHookConfiguration(imageName: "new:2", port: 3001);

        var merged = new WebsiteHookConfiguration(old, @new);

        merged.ImageName.Should().Be("new:2");
        merged.Port.Should().Be(3001);
    }

    [Fact]
    public void Configuration_Merge_KeepsOldPortWhenNewPortUnset()
    {
        var old = new WebsiteHookConfiguration(imageName: "old:1", port: 3000);
        var @new = new WebsiteHookConfiguration();

        var merged = new WebsiteHookConfiguration(old, @new);

        merged.Port.Should().Be(3000);
    }

    [Theory]
    [InlineData(0)]
    [InlineData(-1)]
    public void Build_NonPositiveContainerPort_Throws(int containerPort)
    {
        var builder = new WebsiteHookBuilder().WithPortBinding(8080, containerPort);

        var act = builder.Build;

        act.Should().Throw<ArgumentException>()
            .Which.ParamName.Should().Be(nameof(WebsiteHookConfiguration.Port));
    }
}