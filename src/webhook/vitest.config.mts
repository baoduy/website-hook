import { configDefaults, defineConfig } from "vitest/config";

// Docker-backed acceptance tests (*.docker.test.ts) build and run the real images; they run only
// under `npm run test:docker` (`--mode docker`), so `npm test` stays Docker-free (DRK-2086 Q2).
const DOCKER_TESTS = "**/*.docker.test.ts";

export default defineConfig(({ mode }) => ({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    environment: "node",
    include: mode === "docker" ? [DOCKER_TESTS] : ["**/*.test.ts", "**/*.test.tsx"],
    exclude: mode === "docker" ? configDefaults.exclude : [...configDefaults.exclude, DOCKER_TESTS],
    // Image builds run `npm ci` and `next build` inside Docker.
    ...(mode === "docker" && { hookTimeout: 1_200_000, testTimeout: 180_000 }),
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
        "app/status/page.tsx",
        "app/**/route.ts",
        "components/inspector/**/*.{ts,tsx}",
        "components/status/**/*.{ts,tsx}",
        "components/theme.ts",
        "components/theme-toggle.tsx",
        "hooks/use-mobile.ts",
        "instrumentation.ts",
      ],
      exclude: ["**/*.test.{ts,tsx}", "components/ui/**"],
    },
  },
}));
