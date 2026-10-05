import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
import type { NextConfig } from "next";

// ponytail: dev-only hook; the Docker build stays standalone and ignores this.
initOpenNextCloudflareForDev().catch(() => {
  // Swallowed intentionally — local dev without Wrangler bindings falls back to SQLite.
});

const nextConfig: NextConfig = {
  output: "standalone",
  // Build-time only: "api" builds the API image without the UI pages; empty keeps the combined app.
  env: { WEBSITE_HOOK_ROLE: process.env.WEBSITE_HOOK_ROLE ?? "" },
  // The adapter is external so standalone tracing copies it for scripts/start.js, which requires it.
  serverExternalPackages: ["@prisma/client", ".prisma/client", "@prisma/adapter-better-sqlite3"],
};

export default nextConfig;
