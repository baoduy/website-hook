import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isRateLimited } from "./rateLimit";

// Why: creation is rate-limited 20/min/IP (spec R5) to bound abusive webhook creation.
describe("isRateLimited", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("allows requests up to the limit, then blocks the one that exceeds it", () => {
    const key = "1.2.3.4";
    for (let i = 0; i < 3; i++) {
      expect(isRateLimited(key, 1000, 3)).toBe(false);
    }
    expect(isRateLimited(key, 1000, 3)).toBe(true);
  });

  it("stops blocking once the window has fully elapsed", () => {
    const key = "5.6.7.8";
    for (let i = 0; i < 3; i++) isRateLimited(key, 1000, 3);
    expect(isRateLimited(key, 1000, 3)).toBe(true);

    vi.advanceTimersByTime(1001);

    expect(isRateLimited(key, 1000, 3)).toBe(false);
  });

  it("tracks each key independently, so one caller can't exhaust another's budget", () => {
    const busy = "busy-caller";
    const fresh = "fresh-caller";
    for (let i = 0; i < 3; i++) isRateLimited(busy, 1000, 3);
    expect(isRateLimited(busy, 1000, 3)).toBe(true);

    expect(isRateLimited(fresh, 1000, 3)).toBe(false);
  });
});
