// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MethodBreakdown } from "./method-breakdown";
import type { TrafficMethod } from "@/lib/statistics";

const methods: TrafficMethod[] = [
  { method: "POST", count: 60, percentage: 60 },
  { method: "GET", count: 30, percentage: 30 },
  { method: "DELETE", count: 10, percentage: 10 },
];

describe("MethodBreakdown", () => {
  it("lists each method with its count and percentage, DELETE abbreviated to DEL", () => {
    render(<MethodBreakdown methods={methods} empty={false} />);
    expect(screen.getByText("POST")).toBeTruthy();
    expect(screen.getByText("GET")).toBeTruthy();
    expect(screen.getByText("DEL")).toBeTruthy();
    expect(screen.getByText("60")).toBeTruthy();
    expect(screen.getByText("30%")).toBeTruthy();
    expect(screen.getByText("10%")).toBeTruthy();
  });

  it("shows an explicit empty state when there is no traffic", () => {
    render(<MethodBreakdown methods={[]} empty={true} />);
    expect(screen.getByText("No requests captured in this window.")).toBeTruthy();
    expect(screen.queryByText("POST")).toBeNull();
  });
});
