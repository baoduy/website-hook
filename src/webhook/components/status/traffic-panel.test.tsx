// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { TrafficPanel } from "./traffic-panel";
import type { Traffic, TrafficWindow } from "@/lib/statistics";

function traffic(overrides: Partial<Traffic> = {}): Traffic {
  return {
    window: "24h",
    bucketSize: "1h",
    buckets: [{ start: 1, count: 31 }, { start: 2, count: 10 }],
    totalRequests: 148,
    busiestBucket: 31,
    averagePerDay: 148,
    activeWebhooks: 9,
    totalWebhooks: 26,
    payloadBytes: 6 * 1_048_576,
    averageBodyBytes: 153600,
    largestBodyBytes: 921600,
    emptyBodies: 8,
    truncatedBodies: 4,
    methods: [],
    ...overrides,
  };
}

describe("TrafficPanel", () => {
  it("shows the headline figures and the window's bucket description", () => {
    render(<TrafficPanel traffic={traffic()} window="24h" onWindowChange={() => {}} />);
    expect(screen.getByText("Requests")).toBeTruthy();
    expect(screen.getByText("Peak")).toBeTruthy();
    expect(screen.getByText("Per day")).toBeTruthy();
    expect(screen.getByText("Active webhooks")).toBeTruthy();
    expect(screen.getByText("Payload")).toBeTruthy();
    expect(screen.getByText("9 / 26")).toBeTruthy();
    expect(screen.getByText("31")).toBeTruthy(); // busiest bucket (Peak headline)
    expect(screen.getByText("One bar = one hour · last 24 hours")).toBeTruthy();
  });

  it("states the 30-day bucket size when that window is selected", () => {
    render(<TrafficPanel traffic={traffic({ window: "30d", bucketSize: "1d" })} window="30d" onWindowChange={() => {}} />);
    expect(screen.getByText("One bar = one day · last 30 days")).toBeTruthy();
  });

  it("shows an explicit empty state for a window with no traffic", () => {
    render(<TrafficPanel traffic={traffic({ totalRequests: 0, buckets: [], methods: [] })} window="24h" onWindowChange={() => {}} />);
    expect(screen.getByText("No requests captured in this window.")).toBeTruthy();
  });

  it("fires onWindowChange when a different window button is clicked", () => {
    const onWindowChange = vi.fn();
    render(<TrafficPanel traffic={traffic()} window="24h" onWindowChange={onWindowChange} />);
    fireEvent.click(screen.getByText("30d"));
    expect(onWindowChange).toHaveBeenCalledWith("30d");
  });
});
