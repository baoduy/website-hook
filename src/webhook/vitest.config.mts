import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": import.meta.dirname },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "text-summary", "json-summary"],
      include: ["lib/**/*.ts", "app/**/*.ts", "instrumentation.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
