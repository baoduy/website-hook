using Aspire.Hosting.ApplicationModel;

namespace Aspire.Hosting;

/// <summary>
/// Extension methods that add website-hook to a .NET Aspire application model.
/// </summary>
public static class WebsiteHookResourceBuilderExtensions
{
    private const string Registry = "ghcr.io";
    private const string Tag = "latest";
    private const int ContainerPort = 3000;

    /// <summary>
    /// Adds a website-hook API container to the application model, with the rate limit and the webhook quota turned off.
    /// </summary>
    /// <param name="builder">The distributed application builder.</param>
    /// <param name="name">The name of the resource.</param>
    /// <param name="port">The host port of the HTTP endpoint; <see langword="null"/> lets Aspire pick a free port.</param>
    /// <returns>A builder for the website-hook resource.</returns>
    public static IResourceBuilder<WebsiteHookResource> AddWebsiteHook(
        this IDistributedApplicationBuilder builder,
        [ResourceName] string name,
        int? port = null) =>
        builder.AddResource(new WebsiteHookResource(name))
            .WithImage("baoduy/website-hook-api", Tag)
            .WithImageRegistry(Registry)
            .WithHttpEndpoint(port, ContainerPort, WebsiteHookResource.HttpEndpointName)
            .WithEnvironment("DISABLE_RATE_LIMIT", "true")
            .WithEnvironment("DISABLE_WEBHOOK_QUOTA", "true")
            // "/" answers 404 in the API image; the OpenAPI document answers 200 once the server is up.
            .WithHttpHealthCheck("/openapi.json", endpointName: WebsiteHookResource.HttpEndpointName);

    /// <summary>
    /// Adds the website-hook UI as a second container, named <c>&lt;name&gt;-ui</c>, linked to the API resource.
    /// The UI starts once the API is healthy and reaches it through the API's HTTP endpoint.
    /// </summary>
    /// <param name="builder">The website-hook API resource builder.</param>
    /// <param name="port">The host port of the UI's HTTP endpoint; <see langword="null"/> lets Aspire pick a free port.</param>
    /// <returns>The website-hook API resource builder.</returns>
    public static IResourceBuilder<WebsiteHookResource> WithUI(
        this IResourceBuilder<WebsiteHookResource> builder,
        int? port = null)
    {
        builder.ApplicationBuilder.AddResource(new WebsiteHookUIResource($"{builder.Resource.Name}-ui"))
            .WithImage("baoduy/website-hook-ui", Tag)
            .WithImageRegistry(Registry)
            .WithHttpEndpoint(port, ContainerPort, WebsiteHookResource.HttpEndpointName)
            .WithEnvironment("WEBHOOK_API_URL", builder.Resource.PrimaryEndpoint)
            .WaitFor(builder)
            .WithParentRelationship(builder);

        return builder;
    }
}
