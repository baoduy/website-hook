// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WebhookTable } from "./webhook-table";
import type { RecentRequests, WebhookListItem } from "@/lib/statistics";
import type { ApiResult } from "@/lib/statistics/api";

const now = Date.now();
const CLEANUP_AGE_MS = 30 * 24 * 60 * 60 * 1000;

function row(overrides: Partial<WebhookListItem> = {}): WebhookListItem {
  return {
    id: "e3c1b7a4",
    createdAt: now - 2 * 24 * 60 * 60 * 1000,
    lastActivityAt: now - 2 * 60 * 1000,
    requestCount: 148,
    payloadBytes: 1234,
    expiresAt: now + 5 * 24 * 60 * 60 * 1000,
    ...overrides,
  };
}

const ok = <T,>(value: T): ApiResult<T> => ({ ok: true, value });

describe("WebhookTable", () => {
  it("renders a row with created, last-hit, request count, payload and expiry", () => {
    render(
      <WebhookTable
        webhooks={[row()]}
        search=""
        onSearchChange={() => {}}
        totalRequests={4310}
        now={now}
        fetchRequests={() => Promise.resolve(ok({ total: 0, items: [] }))}
      />,
    );
    expect(screen.getByText("e3c1b7a4")).toBeTruthy();
    expect(screen.getByText("148")).toBeTruthy();
    expect(screen.getByText("1.2 KB")).toBeTruthy();
    expect(screen.getByText(/4,310 requests/)).toBeTruthy(); // footer shows total stored requests
  });

  it("expands a row to fetch and show its most recent requests", async () => {
    const fetchRequests = vi.fn().mockResolvedValue(
      ok({
        total: 148,
        items: [{ id: "r1", method: "POST", path: "/stripe/events", createdAt: now, bodySize: 512 }],
      } as RecentRequests),
    );
    render(
      <WebhookTable webhooks={[row()]} search="" onSearchChange={() => {}} totalRequests={0} now={now} fetchRequests={fetchRequests} />,
    );
    fireEvent.click(screen.getByText("e3c1b7a4"));
    await waitFor(() => expect(screen.getByText("/stripe/events")).toBeTruthy());
    expect(screen.getByText("Showing 1 of 148 captured requests.")).toBeTruthy();
  });

  it("states that a webhook has captured no requests when expanded empty", async () => {
    const fetchRequests = vi.fn().mockResolvedValue(ok({ total: 0, items: [] } as RecentRequests));
    render(
      <WebhookTable
        webhooks={[row({ requestCount: 0 })]}
        search=""
        onSearchChange={() => {}}
        totalRequests={0}
        now={now}
        fetchRequests={fetchRequests}
      />,
    );
    fireEvent.click(screen.getByText("e3c1b7a4"));
    await waitFor(() => expect(screen.getByText("No requests captured on this webhook yet.")).toBeTruthy());
  });

  it("shows an explicit empty state with no filter", () => {
    render(
      <WebhookTable webhooks={[]} search="" onSearchChange={() => {}} totalRequests={0} now={now} fetchRequests={() => Promise.resolve(ok({ total: 0, items: [] }))} />,
    );
    expect(screen.getByText("No webhooks stored.")).toBeTruthy();
  });

  it("distinguishes a filter that matches nothing", () => {
    render(
      <WebhookTable
        webhooks={[]}
        search="zzz"
        onSearchChange={() => {}}
        totalRequests={0}
        now={now}
        fetchRequests={() => Promise.resolve(ok({ total: 0, items: [] }))}
      />,
    );
    expect(screen.getByText("No webhook matches that filter.")).toBeTruthy();
  });

  it("marks a webhook created over 30 days ago as stale", () => {
    render(
      <WebhookTable
        webhooks={[row({ createdAt: now - (CLEANUP_AGE_MS + 24 * 60 * 60 * 1000) })]}
        search=""
        onSearchChange={() => {}}
        totalRequests={0}
        now={now}
        fetchRequests={() => Promise.resolve(ok({ total: 0, items: [] }))}
      />,
    );
    expect(screen.getByText("30d+")).toBeTruthy();
  });

  it("propagates filter input changes", () => {
    const onSearchChange = vi.fn();
    render(
      <WebhookTable webhooks={[row()]} search="" onSearchChange={onSearchChange} totalRequests={0} now={now} fetchRequests={() => Promise.resolve(ok({ total: 0, items: [] }))} />,
    );
    fireEvent.change(screen.getByPlaceholderText("Filter by id or path…"), { target: { value: "stripe" } });
    expect(onSearchChange).toHaveBeenCalledWith("stripe");
  });
});
