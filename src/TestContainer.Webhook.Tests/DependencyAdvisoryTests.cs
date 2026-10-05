using FluentAssertions;
using Renci.SshNet;

namespace DKNet.Tests.WebsiteHook.Tests;

// DRK-2073: SSH.NET arrives transitively through Testcontainers. Versions before 2026.0.0
// carry GHSA-q939-rpr3-3284 and GHSA-mggc-4xg6-vcxf.

public class DependencyAdvisoryTests
{
    [Fact]
    public void SshNet_ResolvedVersion_IsPatchedAgainstKnownAdvisories()
    {
        var version = typeof(SshClient).Assembly.GetName().Version;

        version.Should().BeGreaterThanOrEqualTo(new Version(2026, 0, 0));
    }
}
