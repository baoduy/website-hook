// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("@/lib/statistics/api", () => ({
  getTraffic: vi.fn().mockResolvedValue({ ok: true, value: { window: "24h", bucketSize: "1h", buckets: [], totalRequests: 0, busiestBucket: 0, averagePerDay: 0, activeWebhooks: 0, totalWebhooks: 0, payloadBytes: 0, averageBodyBytes: 0, largestBodyBytes: 0, emptyBodies: 0, truncatedBodies: 0, methods: [] } }),
  getStorage: vi.fn().mockResolvedValue({ ok: true, value: { webhooks: 0, capturedRequests: 0, oldWebhooks: 0, oldRequests: 0, oldBytes: 0 } }),
  listWebhooks: vi.fn().mockResolvedValue({ ok: true, value: { items: [] } }),
  previewCleanup: vi.fn().mockResolvedValue({ ok: true, value: { webhooks: [], totalRequests: 0 } }),
  runCleanup: vi.fn().mockResolvedValue({ ok: true, value: { deletedWebhooks: 0, deletedRequests: 0 } }),
  listWebhookRequests: vi.fn().mockResolvedValue({ ok: true, value: { total: 0, items: [] } }),
}));

describe("app/status/page", () => {
  it("renders the status dashboard shell without credentials", async () => {
    const Page = (await import("./page")).default;
    render(<Page />);
    await waitFor(() => expect(screen.getByText("/status")).toBeTruthy());
    expect(screen.getByText("Traffic across all webhooks")).toBeTruthy();
  });
});
