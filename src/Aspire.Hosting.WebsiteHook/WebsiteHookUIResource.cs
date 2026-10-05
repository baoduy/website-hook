namespace Aspire.Hosting.ApplicationModel;

/// <summary>
/// A container resource that runs the website-hook UI image in front of a <see cref="WebsiteHookResource"/>.
/// </summary>
/// <param name="name">The name of the resource.</param>
public sealed class WebsiteHookUIResource(string name) : ContainerResource(name);
