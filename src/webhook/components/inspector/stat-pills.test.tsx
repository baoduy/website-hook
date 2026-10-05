// @vitest-environment happy-dom
import "@/test/component-setup";
import { describe, expect, it } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
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

  describe("webhook idle period (DRK-2061)", () => {
    const DAY = 86_400_000;
    const now = 1_000_000;
    const expiresPill = () => screen.getByText("Expires").closest("[tabindex]") as HTMLElement;
    const tooltipText = async () => {
      fireEvent.focus(expiresPill());
      return (await screen.findByRole("tooltip")).textContent;
    };

    it("shows Never without the warning style for a webhook with no expiry", () => {
      renderPills(<StatPills webhook={summary({ expiresAt: null })} now={now} />);
      const pill = expiresPill();
      expect(within(pill).getByText("Never")).toBeTruthy();
      expect(pill.className).not.toMatch(/destructive/);
      expect(within(pill).getByText("Expires").className).toBe("text-muted-foreground");
    });

    it("states the webhook's own 30-day idle period in the expiry tooltip", async () => {
      renderPills(<StatPills webhook={summary({ lastActivityAt: now, expiresAt: now + 30 * DAY })} now={now} />);
      expect(within(expiresPill()).getByText("in 30d")).toBeTruthy();
      expect(await tooltipText()).toBe("Purged after 30 idle days — any request resets the clock");
    });

    it("states that a webhook with no expiry never expires in the expiry tooltip", async () => {
      renderPills(<StatPills webhook={summary({ lastActivityAt: now, expiresAt: null })} now={now} />);
      expect(await tooltipText()).toBe("Never expires — kept until deleted");
    });
  });
});
