using Docker.DotNet.Models;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Configurations;

namespace DKNet.Tests.WebsiteHook;

/// <summary>
/// Immutable configuration for the website-hook Testcontainers module.
/// </summary>
public sealed class WebsiteHookConfiguration : ContainerConfiguration
{
    public const string DefaultImageName = "ghcr.io/baoduy/website-hook:latest";
    public const int DefaultPort = 3000;

    public WebsiteHookConfiguration(
        string? imageName = null,
        int? port = null)
    {
        ImageName = imageName ?? DefaultImageName;
        Port = port;
    }

    public WebsiteHookConfiguration(IResourceConfiguration<CreateContainerParameters> resourceConfiguration)
        : base(resourceConfiguration)
    {
    }

    public WebsiteHookConfiguration(IContainerConfiguration resourceConfiguration)
        : base(resourceConfiguration)
    {
    }

    public WebsiteHookConfiguration(WebsiteHookConfiguration resourceConfiguration)
        : this(new WebsiteHookConfiguration(), resourceConfiguration)
    {
    }

    public WebsiteHookConfiguration(WebsiteHookConfiguration oldValue, WebsiteHookConfiguration newValue)
        : base(oldValue, newValue)
    {
        ImageName = BuildConfiguration.Combine(oldValue.ImageName, newValue.ImageName);
        Port = BuildConfiguration.Combine(oldValue.Port, newValue.Port);
    }

    /// <summary>
    /// Docker image name used to create the container.
    /// </summary>
    public string ImageName { get; } = DefaultImageName;

    /// <summary>
    /// Internal container port exposed by the website-hook image.
    /// </summary>
    public int? Port { get; } = DefaultPort;
}
