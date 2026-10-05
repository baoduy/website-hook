import { describe, expect, it } from "vitest";
import { isExpiryUrgent, retentionNote, untilTime } from "./formatting";

// Acceptance tests — DRK-2061 §5 (@unit), status-page helpers for the per-webhook idle period.
// Expected strings are the literals from the DRK-2069 brief §3 #14–15.

const NOW = Date.UTC(2026, 9, 5, 9, 0);
const HOUR_MS = 3_600_000;

describe('Scenario: The status-page list shows "Never" without red colour', () => {
  it('reads "Never" as the countdown for "forever-hook"', () => {
    expect(untilTime(NOW, null)).toBe("Never");
  });

  it('does not show the countdown for "forever-hook" in red', () => {
    expect(isExpiryUrgent(NOW, null)).toBe(false);
  });

  it("still shows red under 36 hours for a webhook that expires (unchanged rule)", () => {
    expect(isExpiryUrgent(NOW, NOW + 35 * HOUR_MS)).toBe(true);
    expect(isExpiryUrgent(NOW, NOW + 37 * HOUR_MS)).toBe(false);
  });
});

describe("Scenario Outline: The retention note and cleanup button follow the current setting", () => {
  it('Example: setting "0" — the note says webhooks never expire on this deployment', () => {
    expect(retentionNote(null)).toBe("Webhooks never expire on this deployment.");
  });

  it('Example: setting "30" — the note says new webhooks are deleted after 30 idle days', () => {
    expect(retentionNote(30)).toBe("New webhooks are deleted after 30 idle days.");
  });

  it("Example: setting not set — the note says new webhooks are deleted after 7 idle days", () => {
    expect(retentionNote(7)).toBe("New webhooks are deleted after 7 idle days.");
  });
});
