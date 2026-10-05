using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting;

/// <summary>
/// Extension methods that add website-hook to a .NET Aspire application model.
/// </summary>
public static class WebsiteHookResourceBuilderExtensions
{
    /// <summary>
    /// Adds a website-hook API container to the application model.
    /// </summary>
    /// <param name="builder">The distributed application builder.</param>
    /// <param name="name">The name of the resource.</param>
    /// <param name="port">The host port of the HTTP endpoint; <see langword="null"/> lets Aspire pick a free port.</param>
    /// <returns>A builder for the website-hook resource.</returns>
    public static IResourceBuilder<WebsiteHookResource> AddWebsiteHook(
        this IDistributedApplicationBuilder builder,
        [ResourceName] string name,
        int? port = null)
    {
        throw new NotImplementedException();
    }

    /// <summary>
    /// Adds the website-hook UI as a second container, named <c>&lt;name&gt;-ui</c>, linked to the API resource.
    /// </summary>
    /// <param name="builder">The website-hook API resource builder.</param>
    /// <param name="port">The host port of the UI's HTTP endpoint; <see langword="null"/> lets Aspire pick a free port.</param>
    /// <returns>The website-hook API resource builder.</returns>
    public static IResourceBuilder<WebsiteHookResource> WithUI(
        this IResourceBuilder<WebsiteHookResource> builder,
        int? port = null)
    {
        throw new NotImplementedException();
    }
}
