using DotNet.Testcontainers.Containers;

namespace DKNet.Tests.WebsiteHook;

/// <summary>
/// A Testcontainers container running the website-hook image.
/// </summary>
public sealed class WebsiteHookContainer : DockerContainer
{
    /// <summary>
    /// Initializes a new instance of the <see cref="WebsiteHookContainer"/> class.
    /// </summary>
    /// <param name="configuration">The container configuration.</param>
    public WebsiteHookContainer(WebsiteHookConfiguration configuration)
        : base(configuration)
    {
    }

    /// <summary>
    /// Returns the mapped HTTP URI for the website-hook service.
    /// </summary>
    public Uri GetServiceUri()
    {
        return new UriBuilder(Uri.UriSchemeHttp, Hostname, GetMappedPublicPort(WebsiteHookBuilder.WebsiteHookPort)).Uri;
    }
}
