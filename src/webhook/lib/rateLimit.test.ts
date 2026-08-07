import { afterEach, describe, expect, it, vi } from "vitest";
import { CREATE_RATE_LIMIT } from "./constants";
import { __mapSizeForTests, __resetForTests, isRateLimited } from "./rateLimit";

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

  it("bounds memory: 10,000 one-shot stale callers are evicted after the eviction cycle shrinks the map", () => {
    vi.useFakeTimers();
    __resetForTests();
    const windowMs = CREATE_RATE_LIMIT.windowMs;

    // 10,000 distinct callers each make a single request at t=0.
    for (let i = 0; i < 10_000; i++) {
      expect(isRateLimited(`caller-${i}`, windowMs, 5)).toBe(false);
    }
    expect(__mapSizeForTests()).toBe(10_000);

    // Advance past the window so every caller is stale, then trigger an eviction scan.
    vi.advanceTimersByTime(windowMs + 2000);
    expect(isRateLimited("trigger", windowMs, 5)).toBe(false);

    // All 10,000 stale entries were outside the window and removed; only the new entry remains.
    expect(__mapSizeForTests()).toBe(1);
  });

  it("bounds memory: active callers survive an eviction scan at 10,000-caller scale", () => {
    vi.useFakeTimers();
    __resetForTests();
    const windowMs = CREATE_RATE_LIMIT.windowMs;

    // An active caller hits the limit at t=0.
    const active = "active-10k";
    for (let i = 0; i < 5; i++) expect(isRateLimited(active, windowMs, 5)).toBe(false);
    expect(isRateLimited(active, windowMs, 5)).toBe(true);

    // 10,000 stale one-shot callers pile up alongside it.
    for (let i = 0; i < 10_000; i++) {
      isRateLimited(`stale-${i}`, windowMs, 5);
    }

    // Advance only past the eviction interval (NOT past the window) and trigger a scan via a fresh call.
    vi.advanceTimersByTime(2000);
    isRateLimited("trigger", windowMs, 5);

    // The active caller is still within its window and must remain capped.
    expect(isRateLimited(active, windowMs, 5)).toBe(true);
  });
});
