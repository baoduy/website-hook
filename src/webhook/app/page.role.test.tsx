// @vitest-environment happy-dom
import "@/test/component-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

// Acceptance tests — DRK-2086 §6a D7 / rule R5: the build-time role WEBSITE_HOOK_ROLE decides
// whether the UI pages exist. "api" → not found (HTTP 404); empty or unset → today's pages.
// The unset row is the existing app/page.test.tsx and app/status/page.test.tsx.

vi.mock("@/lib/inspector/api");
// The Status page only needs to mount here; every statistics call answers with its error state.
vi.mock("@/lib/statistics/api", () => {
  const failing = () => vi.fn().mockResolvedValue({ ok: false, error: "network" });
  return {
    getTraffic: failing(),
    getStorage: failing(),
    listWebhooks: failing(),
    listWebhookRequests: failing(),
    previewCleanup: failing(),
    runCleanup: failing(),
  };
});

// Next's notFound() throws an error carrying this digest; the 404 is its HTTP status.
const NOT_FOUND_DIGEST = "NEXT_HTTP_ERROR_FALLBACK;404";

beforeEach(() => {
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

function digestOf(render: () => unknown): string | undefined {
  try {
    render();
  } catch (error) {
    return (error as { digest?: string }).digest;
  }
  return undefined;
}

describe("Scenario Outline: The API image serves no UI pages — role \"api\"", () => {
  it("the Inspector page is not found", async () => {
    vi.stubEnv("WEBSITE_HOOK_ROLE", "api");
    const Page = (await import("./page")).default;

    expect(digestOf(() => Page())).toBe(NOT_FOUND_DIGEST);
  });

  it("the Status page is not found", async () => {
    vi.stubEnv("WEBSITE_HOOK_ROLE", "api");
    const StatusPage = (await import("./status/page")).default;

    expect(digestOf(() => StatusPage())).toBe(NOT_FOUND_DIGEST);
  });
});

describe("Combined build — empty role keeps today's pages (R5)", () => {
  it("the Inspector page renders when the role is empty", async () => {
    vi.stubEnv("WEBSITE_HOOK_ROLE", "");
    const Page = (await import("./page")).default;

    render(<Page />);

    await waitFor(() => expect(screen.getByText("Nothing remembered in this browser yet.")).toBeTruthy());
  });

  it("the Status page renders when the role is empty", async () => {
    vi.stubEnv("WEBSITE_HOOK_ROLE", "");
    const StatusPage = (await import("./status/page")).default;

    render(<StatusPage />);

    await waitFor(() => expect(screen.getByText("Traffic across all webhooks")).toBeTruthy());
  });
});
