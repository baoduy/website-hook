import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts", "**/*.test.tsx"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary"],
      // The inspector cycle introduced the React surface under components/inspector/**,
      // components/theme*, hooks/use-mobile, and the root app/* pages alongside the
      // pre-existing node-environment lib/app coverage. The vendored shadcn primitives
      // under components/ui/** are framework glue with no cycle-authored behaviour, so they
      // stay out of the gate (brief: "never pad with trivial tests (getters, framework code)").
      include: [
        "lib/**/*.ts",
        "app/page.tsx",
        "app/layout.tsx",
        "app/api/webhooks/route.ts",
        "components/inspector/**/*.{ts,tsx}",
        "components/theme.ts",
        "components/theme-toggle.tsx",
        "hooks/use-mobile.ts",
        "instrumentation.ts",
      ],
      exclude: ["**/*.test.{ts,tsx}", "components/ui/**"],
    },
  },
});
