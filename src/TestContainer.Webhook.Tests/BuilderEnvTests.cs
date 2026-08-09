using System.Reflection;
using FluentAssertions;

namespace DKNet.Tests.WebsiteHook.Tests;

// QC verification (DRK-275): the Testcontainers module must ship with BOTH the creation rate
// limit and the per-IP webhook quota disabled by default (spec D5), and a consumer must be able
// to opt back into either independently. The env-var contract lives on the builder's immutable
// resource configuration (no public surface exposes it on the built container), so this reads
// the protected DockerResourceConfiguration.Environments via reflection — a builder contract
// check, never a container-runtime behaviour check.

public class BuilderEnvTests
{
    private static IReadOnlyDictionary<string, string> Env(WebsiteHookBuilder builder)
    {
        // `DockerResourceConfiguration` is declared at multiple levels of the ContainerBuilder
        // hierarchy; resolve the one declared on WebsiteHookBuilder itself (the most-derived override).
        var prop = typeof(WebsiteHookBuilder)
            .GetProperties(BindingFlags.Instance | BindingFlags.NonPublic | BindingFlags.Public)
            .First(p => p.Name == "DockerResourceConfiguration" && p.DeclaringType == typeof(WebsiteHookBuilder));
        var config = prop.GetValue(builder);
        var envProp = config!.GetType().GetProperty("Environments");
        return (IReadOnlyDictionary<string, string>)envProp!.GetValue(config)!;
    }

    [Fact]
    public void DefaultBuilder_DisablesRateLimitByDefault()
    {
        var env = Env(new WebsiteHookBuilder());

        env.Should().ContainKey("DISABLE_RATE_LIMIT");
        env["DISABLE_RATE_LIMIT"].Should().Be("true");
    }

    [Fact]
    public void DefaultBuilder_DisablesWebhookQuotaByDefault()
    {
        var env = Env(new WebsiteHookBuilder());

        env.Should().ContainKey("DISABLE_WEBHOOK_QUOTA");
        env["DISABLE_WEBHOOK_QUOTA"].Should().Be("true");
    }

    [Fact]
    public void DefaultBuilder_BothLimitsOffSoDotNetTestsAreNeverBlocked()
    {
        var env = Env(new WebsiteHookBuilder());

        env["DISABLE_RATE_LIMIT"].Should().Be("true");
        env["DISABLE_WEBHOOK_QUOTA"].Should().Be("true");
    }

    [Fact]
    public void Consumer_CanOptBackIntoTheWebhookQuota()
    {
        var env = Env(new WebsiteHookBuilder()
            .WithEnvironment("DISABLE_WEBHOOK_QUOTA", "false")
            .WithEnvironment("WEBHOOK_QUOTA", "3"));

        env["DISABLE_WEBHOOK_QUOTA"].Should().Be("false");
        env["WEBHOOK_QUOTA"].Should().Be("3");
    }

    [Fact]
    public void Consumer_CanOptBackIntoTheRateLimitIndependently()
    {
        var env = Env(new WebsiteHookBuilder()
            .WithEnvironment("DISABLE_RATE_LIMIT", "false"));

        // Quota stays disabled by default; only the rate limit is opted back in — proving the
        // two controls are independent knobs on the builder (spec R3).
        env["DISABLE_RATE_LIMIT"].Should().Be("false");
        env["DISABLE_WEBHOOK_QUOTA"].Should().Be("true");
    }

    [Fact]
    public void Consumer_CanReEnableBothLimitsTogether()
    {
        var env = Env(new WebsiteHookBuilder()
            .WithEnvironment("DISABLE_RATE_LIMIT", "false")
            .WithEnvironment("DISABLE_WEBHOOK_QUOTA", "false"));

        env["DISABLE_RATE_LIMIT"].Should().Be("false");
        env["DISABLE_WEBHOOK_QUOTA"].Should().Be("false");
    }

    [Fact]
    public void ConsumerOverride_TakesPrecedenceOverTheDefaultDisabledQuota()
    {
        // A later WithEnvironment on the same key replaces the Init default — the consumer wins.
        var env = Env(new WebsiteHookBuilder()
            .WithEnvironment("DISABLE_WEBHOOK_QUOTA", "false"));

        env["DISABLE_WEBHOOK_QUOTA"].Should().Be("false");
    }
}