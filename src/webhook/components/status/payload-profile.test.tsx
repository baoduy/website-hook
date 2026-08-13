// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PayloadProfile } from "./payload-profile";
import type { Traffic } from "@/lib/statistics";

function traffic(overrides: Partial<Traffic> = {}): Traffic {
  return {
    window: "24h",
    bucketSize: "1h",
    buckets: [],
    totalRequests: 40,
    busiestBucket: 0,
    averagePerDay: 40,
    activeWebhooks: 0,
    totalWebhooks: 0,
    payloadBytes: 6 * 1_048_576,
    averageBodyBytes: 153600,
    largestBodyBytes: 921600,
    emptyBodies: 8,
    truncatedBodies: 4,
    methods: [],
    ...overrides,
  };
}

describe("PayloadProfile", () => {
  it("renders total, average, largest, empty and truncated figures", () => {
    render(<PayloadProfile traffic={traffic()} />);
    expect(screen.getByText("Total received")).toBeTruthy();
    expect(screen.getByText("6.00 MB")).toBeTruthy();
    expect(screen.getByText("Average body")).toBeTruthy();
    expect(screen.getByText("150.0 KB")).toBeTruthy();
    expect(screen.getByText("Largest body")).toBeTruthy();
    expect(screen.getByText("900.0 KB")).toBeTruthy();
    expect(screen.getByText("Empty bodies")).toBeTruthy();
    expect(screen.getByText("8 of 40")).toBeTruthy();
    expect(screen.getByText("Truncated at 1 MB")).toBeTruthy();
    expect(screen.getByText("4")).toBeTruthy();
  });

  it("renders nothing when traffic is not yet loaded", () => {
    render(<PayloadProfile traffic={null} />);
    expect(screen.queryByText("Total received")).toBeNull();
  });
});
