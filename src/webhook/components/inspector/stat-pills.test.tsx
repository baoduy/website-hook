// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { StatPills } from "./stat-pills";
import type { WebhookSummary } from "@/lib/inspector/api";

const summary = (overrides: Partial<WebhookSummary> = {}): WebhookSummary => ({
  id: "w1",
  createdAt: 0,
  lastActivityAt: 0,
  requestCount: 0,
  expiresAt: 0,
  ...overrides,
});

const renderPills = (ui: React.ReactElement) =>
  render(<TooltipProvider>{ui}</TooltipProvider>);

describe("StatPills", () => {
  it("renders the four pills with their labels", () => {
    renderPills(<StatPills webhook={summary({ requestCount: 42 })} now={1_000_000} />);
    expect(screen.getByText("Created")).toBeTruthy();
    expect(screen.getByText("Last hit")).toBeTruthy();
    expect(screen.getByText("Captured")).toBeTruthy();
    expect(screen.getByText("Expires")).toBeTruthy();
    expect(screen.getByText("42")).toBeTruthy();
  });

  it("warns (destructive style) when expiry is within 6h", () => {
    const now = 1_000_000;
    const { container } = renderPills(<StatPills webhook={summary({ expiresAt: now + 60_000 })} now={now} />);
    expect(container.querySelector('[class*="border-destructive"]')).toBeTruthy();
  });

  it("does not warn when more than 6h remain", () => {
    const now = 1_000_000;
    const { container } = renderPills(
      <StatPills webhook={summary({ expiresAt: now + 7 * 60 * 60 * 1000 })} now={now} />,
    );
    expect(container.querySelector('[class*="border-destructive"]')).toBeNull();
  });
});