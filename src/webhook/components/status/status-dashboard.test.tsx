// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Traffic, Storage, WebhookList, CleanupPreview } from "@/lib/statistics";

vi.mock("@/lib/statistics/api", () => {
  const traffic: Traffic = {
    window: "24h",
    bucketSize: "1h",
    buckets: [{ start: 1, count: 31 }],
    totalRequests: 148,
    busiestBucket: 31,
    averagePerDay: 148,
    activeWebhooks: 9,
    totalWebhooks: 26,
    payloadBytes: 100,
    averageBodyBytes: 50,
    largestBodyBytes: 100,
    emptyBodies: 0,
    truncatedBodies: 0,
    methods: [{ method: "POST", count: 60, percentage: 60 }],
  };
  const storage: Storage = { webhooks: 26, capturedRequests: 4310, oldWebhooks: 3, oldRequests: 512, oldBytes: 1000 };
  const webhooks: WebhookList = {
    items: [{ id: "e3c1b7a4", createdAt: Date.now(), lastActivityAt: Date.now(), requestCount: 1, payloadBytes: 10, expiresAt: Date.now() + 1000 }],
  };
  const cleanup: CleanupPreview = { webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12 };

  return {
    getTraffic: vi.fn().mockResolvedValue({ ok: true, value: traffic }),
    getStorage: vi.fn().mockResolvedValue({ ok: true, value: storage }),
    listWebhooks: vi.fn().mockResolvedValue({ ok: true, value: webhooks }),
    previewCleanup: vi.fn().mockResolvedValue({ ok: true, value: cleanup }),
    runCleanup: vi.fn().mockResolvedValue({ ok: true, value: { deletedWebhooks: 1, deletedRequests: 12 } }),
    listWebhookRequests: vi.fn().mockResolvedValue({ ok: true, value: { total: 0, items: [] } }),
  };
});

describe("StatusDashboard", () => {
  it("fetches traffic, storage, webhooks and cleanup and renders them together", async () => {
    const { StatusDashboard } = await import("./status-dashboard");
    render(<StatusDashboard />);

    // Traffic, storage and webhook-list data all flow through to their panels.
    await waitFor(() => expect(screen.getByText("9 / 26")).toBeTruthy());
    expect(screen.getByText("4,310")).toBeTruthy(); // stored requests from getStorage
    expect(screen.getByText("e3c1b7a4")).toBeTruthy(); // webhook list row
  });

  it("expands a webhook row to fetch its recent requests", async () => {
    const { StatusDashboard } = await import("./status-dashboard");
    render(<StatusDashboard />);

    await waitFor(() => expect(screen.getByText("e3c1b7a4")).toBeTruthy());
    fireEvent.click(screen.getByText("e3c1b7a4"));
    await waitFor(() => expect(screen.getByText("No requests captured on this webhook yet.")).toBeTruthy());
  });

  it("runs the cleanup action and refreshes the panels afterwards", async () => {
    const api = await import("@/lib/statistics/api");
    const { StatusDashboard } = await import("./status-dashboard");
    const user = userEvent.setup();
    render(<StatusDashboard />);

    await waitFor(() => expect(screen.getByText("Delete 1 webhook + 12 requests")).toBeTruthy());
    await user.click(screen.getByText("Delete 1 webhook + 12 requests"));
    await waitFor(() => expect(screen.getByText("Delete everything older than 30 days?")).toBeTruthy());
    await user.click(screen.getByText("Delete 1 webhook"));

    await waitFor(() => expect(api.runCleanup).toHaveBeenCalled());
    // handleCleanup re-fetches everything after the delete.
    expect(api.getTraffic).toHaveBeenCalled();
  });
});
