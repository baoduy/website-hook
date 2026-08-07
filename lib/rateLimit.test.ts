import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_RATE_LIMIT } from "./constants";
import { isRateLimited } from "./rateLimit";

describe("isRateLimited", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the max within the window, then rejects", () => {
    const key = "1.1.1.1";
    for (let i = 0; i < CREATE_RATE_LIMIT.max; i++) {
      expect(isRateLimited(key, CREATE_RATE_LIMIT.windowMs, CREATE_RATE_LIMIT.max)).toBe(false);
    }
    expect(isRateLimited(key, CREATE_RATE_LIMIT.windowMs, CREATE_RATE_LIMIT.max)).toBe(true);
  });

  it("evicts stale entries once the window has passed", () => {
    vi.useFakeTimers();
    const key = "stale-caller";
    const windowMs = 1000;

    expect(isRateLimited(key, windowMs, 1)).toBe(false);
    expect(isRateLimited(key, windowMs, 1)).toBe(true);

    vi.advanceTimersByTime(windowMs + 1);
    expect(isRateLimited(key, windowMs, 1)).toBe(false);
  });

  it("keeps active callers limited even after an eviction scan runs", () => {
    vi.useFakeTimers();
    const key = "active-caller";
    const windowMs = 10_000;

    expect(isRateLimited(key, windowMs, 2)).toBe(false);
    expect(isRateLimited(key, windowMs, 2)).toBe(false);

    // Advance past the eviction interval but not past the rate-limit window.
    vi.advanceTimersByTime(1001);
    // Trigger the eviction scan with another key; the active caller must stay capped.
    isRateLimited("other-caller", windowMs, 1);
    expect(isRateLimited(key, windowMs, 2)).toBe(true);
  });

  it("gives distinct keys independent buckets", () => {
    const keyA = "caller-a";
    const keyB = "caller-b";

    for (let i = 0; i < CREATE_RATE_LIMIT.max; i++) {
      expect(isRateLimited(keyA, CREATE_RATE_LIMIT.windowMs, CREATE_RATE_LIMIT.max)).toBe(false);
    }
    expect(isRateLimited(keyA, CREATE_RATE_LIMIT.windowMs, CREATE_RATE_LIMIT.max)).toBe(true);
    expect(isRateLimited(keyB, CREATE_RATE_LIMIT.windowMs, CREATE_RATE_LIMIT.max)).toBe(false);
  });
});
