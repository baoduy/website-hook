import { describe, expect, it } from "vitest";
import { expiryTooltip, idleDays, isExpiringSoon, timeUntil } from "./format";

// Acceptance tests — DRK-2061 §5 (@unit), inspector helpers for the per-webhook idle period.
// Expected strings are the literals from the DRK-2069 brief §3 #12–13.

const NOW = Date.UTC(2026, 9, 5, 9, 0);
const DAY_MS = 86_400_000;

describe('Scenario: The inspector shows "Never" for a webhook with no expiry', () => {
  it('reads "Never" as the countdown of "forever-hook"', () => {
    expect(timeUntil(null, NOW)).toBe("Never");
  });

  it('shows no expiry warning for "forever-hook"', () => {
    expect(isExpiringSoon(null, NOW)).toBe(false);
  });
});

describe("Scenario Outline: The inspector tooltip states the webhook's own period", () => {
  it('Example: 30-day period — the tooltip says "30 idle days"', () => {
    const lastActivityAt = NOW - 2 * DAY_MS;
    const expiresAt = lastActivityAt + 30 * DAY_MS;

    expect(idleDays(expiresAt, lastActivityAt)).toBe(30);
    expect(expiryTooltip(expiresAt, lastActivityAt)).toBe("Purged after 30 idle days — any request resets the clock");
  });

  it('Example: never — the tooltip says "never expires"', () => {
    expect(idleDays(null, NOW)).toBeNull();
    expect(expiryTooltip(null, NOW)).toBe("Never expires — kept until deleted");
  });
});
