using Docker.DotNet.Models;
using DotNet.Testcontainers.Builders;
using DotNet.Testcontainers.Configurations;
using DotNet.Testcontainers.Images;

namespace DKNet.Tests.WebsiteHook;

/// <summary>
/// Fluent builder for creating a <see cref="WebsiteHookContainer"/>.
/// </summary>
public sealed class WebsiteHookBuilder : ContainerBuilder<WebsiteHookBuilder, WebsiteHookContainer, WebsiteHookConfiguration>
{
    public const string WebsiteHookImage = WebsiteHookConfiguration.DefaultImageName;
    public const int WebsiteHookPort = WebsiteHookConfiguration.DefaultPort;

    /// <summary>
    /// Initializes a new instance of the <see cref="WebsiteHookBuilder"/> class.
    /// </summary>
    public WebsiteHookBuilder()
        : this(new WebsiteHookConfiguration())
    {
        DockerResourceConfiguration = Init().DockerResourceConfiguration;
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="WebsiteHookBuilder"/> class.
    /// </summary>
    /// <param name="image">The full Docker image name.</param>
    public WebsiteHookBuilder(string image)
        : this(new WebsiteHookConfiguration())
    {
        DockerResourceConfiguration = Init().WithImage(image).DockerResourceConfiguration;
    }

    /// <summary>
    /// Initializes a new instance of the <see cref="WebsiteHookBuilder"/> class.
    /// </summary>
    /// <param name="image">An <see cref="IImage"/> instance that specifies the Docker image.</param>
    public WebsiteHookBuilder(IImage image)
        : this(new WebsiteHookConfiguration())
    {
        DockerResourceConfiguration = Init().WithImage(image).DockerResourceConfiguration;
    }

    private WebsiteHookBuilder(WebsiteHookConfiguration resourceConfiguration)
        : base(resourceConfiguration)
    {
        DockerResourceConfiguration = resourceConfiguration;
    }

    /// <inheritdoc />
    protected override WebsiteHookConfiguration DockerResourceConfiguration { get; }

    /// <summary>
    /// Sets the Docker image name.
    /// </summary>
    public new WebsiteHookBuilder WithImage(string image)
    {
        if (string.IsNullOrWhiteSpace(image))
        {
            throw new ArgumentException("Image cannot be empty.", nameof(WebsiteHookConfiguration.ImageName));
        }

        var builder = (WebsiteHookBuilder)base.WithImage(image);
        return builder.Merge(builder.DockerResourceConfiguration, new WebsiteHookConfiguration(imageName: image));
    }

    /// <summary>
    /// Binds a host port to the specified container port.
    /// </summary>
    public new WebsiteHookBuilder WithPortBinding(int hostPort, int containerPort)
    {
        var builder = (WebsiteHookBuilder)base.WithPortBinding(hostPort, containerPort);
        return builder.Merge(builder.DockerResourceConfiguration, new WebsiteHookConfiguration(port: containerPort));
    }

    /// <inheritdoc />
    public override WebsiteHookContainer Build()
    {
        Validate();
        return new WebsiteHookContainer(DockerResourceConfiguration);
    }

    /// <inheritdoc />
    protected override WebsiteHookBuilder Init()
    {
        return base.Init()
            .WithImage(WebsiteHookImage)
            .WithPortBinding(WebsiteHookPort, true)
            .WithEnvironment("DISABLE_RATE_LIMIT", "true")
            .WithEnvironment("DISABLE_WEBHOOK_QUOTA", "true")
            .WithWaitStrategy(Wait.ForUnixContainer()
                .UntilHttpRequestIsSucceeded(r => r
                    .ForPort(WebsiteHookPort)
                    .ForPath("/00000000-0000-0000-0000-000000000000")
                    .ForStatusCodeMatching(statusCode => (int)statusCode >= 200 && (int)statusCode < 600)));
    }

    /// <inheritdoc />
    protected override void Validate()
    {
        base.Validate();

        if (string.IsNullOrWhiteSpace(DockerResourceConfiguration.ImageName))
        {
            throw new ArgumentException("Image cannot be empty.", nameof(WebsiteHookConfiguration.ImageName));
        }

        if (!DockerResourceConfiguration.Port.HasValue || DockerResourceConfiguration.Port.Value <= 0)
        {
            throw new ArgumentException("Port must be greater than 0.", nameof(WebsiteHookConfiguration.Port));
        }
    }

    /// <inheritdoc />
    protected override WebsiteHookBuilder Clone(IResourceConfiguration<CreateContainerParameters> resourceConfiguration)
    {
        return Merge(DockerResourceConfiguration, new WebsiteHookConfiguration(resourceConfiguration));
    }

    /// <inheritdoc />
    protected override WebsiteHookBuilder Clone(IContainerConfiguration resourceConfiguration)
    {
        return Merge(DockerResourceConfiguration, new WebsiteHookConfiguration(resourceConfiguration));
    }

    /// <inheritdoc />
    protected override WebsiteHookBuilder Merge(WebsiteHookConfiguration oldValue, WebsiteHookConfiguration newValue)
    {
        return new WebsiteHookBuilder(new WebsiteHookConfiguration(oldValue, newValue));
    }
}
