import { describe, expect, it } from "vitest";
import {
  formatBytes,
  formatStamp,
  isExpiringSoon,
  relativeTime,
  shortId,
  timeUntil,
} from "./format";
import { EXPIRY_WARNING_MS } from "@/lib/constants";

const NOW = 1_700_000_000_000;

describe("relativeTime", () => {
  it("reads seconds under a minute", () => {
    expect(relativeTime(NOW, NOW)).toBe("0s ago");
    expect(relativeTime(NOW - 59_000, NOW)).toBe("59s ago");
  });
  it("reads minutes under an hour", () => {
    expect(relativeTime(NOW - 60_000, NOW)).toBe("1m ago");
    expect(relativeTime(NOW - 59 * 60_000, NOW)).toBe("59m ago");
  });
  it("reads hours under a day", () => {
    expect(relativeTime(NOW - 3_600_000, NOW)).toBe("1h ago");
    expect(relativeTime(NOW - 23 * 3_600_000, NOW)).toBe("23h ago");
  });
  it("reads days beyond that", () => {
    expect(relativeTime(NOW - 86_400_000, NOW)).toBe("1d ago");
    expect(relativeTime(NOW - 5 * 86_400_000, NOW)).toBe("5d ago");
  });
  it("clamps to 0s ago on clock skew so the UI never shows a negative age", () => {
    expect(relativeTime(NOW + 10_000, NOW)).toBe("0s ago");
  });
});

describe("timeUntil", () => {
  it("reads minutes under an hour", () => {
    expect(timeUntil(NOW + 42 * 60_000, NOW)).toBe("in 42m");
  });
  it("reads hours under a day", () => {
    expect(timeUntil(NOW + 5 * 3_600_000, NOW)).toBe("in 5h");
  });
  it("reads days beyond that", () => {
    expect(timeUntil(NOW + 3 * 86_400_000, NOW)).toBe("in 3d");
  });
  it("clamps to in 0m at or before now", () => {
    expect(timeUntil(NOW, NOW)).toBe("in 0m");
    expect(timeUntil(NOW - 1_000, NOW)).toBe("in 0m");
  });
});

describe("formatBytes", () => {
  it("reports no body at zero", () => {
    expect(formatBytes(0)).toBe("no body");
  });
  it("uses byte units under 1024", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });
  it("uses kilobytes at 1024 and above with one decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
    expect(formatBytes(2560)).toBe("2.5 KB");
  });
});

describe("formatStamp", () => {
  // The contract is "HH:MM:SS · DD Mon" — day BEFORE month, day zero-padded. Assert the
  // ordering and padded day without depending on the host locale's month spelling.
  it("composes clock · DD <month> with the day before the month, padded", () => {
    const ts = new Date(2026, 7, 8, 14, 7, 33).getTime(); // 08 Aug 2026 14:07:33 local
    const stamp = formatStamp(ts);
    expect(stamp).toMatch(/^\d{2}:\d{2}:\d{2} · 08 \D/);
    expect(stamp.startsWith("14:07:33 · 08 ")).toBe(true);
  });

  it("zero-pads the day", () => {
    const ts = new Date(2026, 2, 5, 0, 0, 1).getTime(); // 05 Mar
    expect(formatStamp(ts)).toMatch(/ · 05 \D/);
  });
});

describe("shortId", () => {
  it("returns short ids unchanged", () => {
    expect(shortId("short123")).toBe("short123");
  });
  it("truncates a UUID to first8…last4", () => {
    expect(shortId("457fb06b-1234-4abc-9def-049d9999zzzz")).toBe("457fb06b…zzzz");
  });
});

describe("isExpiringSoon — 6-hour boundary (EXPIRY_WARNING_MS)", () => {
  it("warns when less than 6h remain", () => {
    expect(isExpiringSoon(NOW + EXPIRY_WARNING_MS - 1, NOW)).toBe(true);
    expect(isExpiringSoon(NOW + 60_000, NOW)).toBe(true);
  });
  it("does not warn at exactly 6h (the boundary is strict <)", () => {
    expect(isExpiringSoon(NOW + EXPIRY_WARNING_MS, NOW)).toBe(false);
  });
  it("does not warn when more than 6h remain", () => {
    expect(isExpiringSoon(NOW + EXPIRY_WARNING_MS + 1, NOW)).toBe(false);
  });
  it("warns for an already-expired webhook (negative remaining)", () => {
    expect(isExpiringSoon(NOW - 1000, NOW)).toBe(true);
  });
});