import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// ponytail: dev-only hook; the Docker build stays standalone and ignores this.
initOpenNextCloudflareForDev().catch(() => {
  // Swallowed intentionally — local dev without Wrangler bindings falls back to SQLite.
});

const nextConfig: NextConfig = {
  output: "standalone",
};

export default nextConfig;
