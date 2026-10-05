namespace Aspire.Hosting.ApplicationModel;

/// <summary>
/// A container resource that runs the website-hook API image.
/// </summary>
/// <param name="name">The name of the resource.</param>
public sealed class WebsiteHookResource(string name) : ContainerResource(name), IResourceWithServiceDiscovery
{
    internal const string HttpEndpointName = "http";

    /// <summary>
    /// Gets the primary HTTP endpoint of the website-hook API.
    /// </summary>
    public EndpointReference PrimaryEndpoint => field ??= new(this, HttpEndpointName);
}
