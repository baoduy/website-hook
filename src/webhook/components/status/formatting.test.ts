import { describe, expect, it } from "vitest";
import { formatBytes, formatNumber, relativeTime, untilTime, bucketLabel } from "./formatting";

describe("formatBytes", () => {
  it("renders zero as 0 B", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("renders sub-kilobyte sizes as bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
  });

  it("renders kilobyte sizes with one decimal", () => {
    expect(formatBytes(1536)).toBe("1.5 KB");
  });

  it("renders megabyte sizes with two decimals", () => {
    expect(formatBytes(6 * 1_048_576)).toBe("6.00 MB");
  });
});

describe("formatNumber", () => {
  it("groups thousands with commas", () => {
    expect(formatNumber(4310)).toBe("4,310");
    expect(formatNumber(1000000)).toBe("1,000,000");
  });

  it("leaves small numbers unchanged", () => {
    expect(formatNumber(148)).toBe("148");
  });
});

describe("relativeTime", () => {
  it("renders seconds, minutes, hours and days with a floor", () => {
    const now = 1_000_000_000;
    expect(relativeTime(now, now - 30_000)).toBe("30s ago");
    expect(relativeTime(now, now - 2 * 60_000)).toBe("2m ago");
    expect(relativeTime(now, now - 6 * 3_600_000)).toBe("6h ago");
    expect(relativeTime(now, now - 2 * 86_400_000)).toBe("2d ago");
  });

  it("never reports a negative age for a future timestamp", () => {
    const now = 1_000_000_000;
    expect(relativeTime(now, now + 5_000)).toBe("0s ago");
  });
});

describe("untilTime", () => {
  it("reports expiry for a past timestamp", () => {
    expect(untilTime(1_000_000_000, 1_000_000_000 - 1)).toBe("expired");
  });

  it("reports minutes, hours and days remaining", () => {
    const now = 1_000_000_000;
    expect(untilTime(now, now + 90_000)).toBe("in 1m");
    expect(untilTime(now, now + 3 * 3_600_000)).toBe("in 3h");
    expect(untilTime(now, now + 2 * 86_400_000)).toBe("in 2d");
  });
});

describe("bucketLabel", () => {
  it("labels a 24h bucket as an hour of the day", () => {
    const t = new Date(2026, 7, 13, 5, 0, 0).getTime();
    expect(bucketLabel(t, "24h")).toBe("05:00");
  });

  it("labels a 30d bucket as day/month", () => {
    const t = new Date(2026, 7, 13, 5, 0, 0).getTime();
    expect(bucketLabel(t, "30d")).toBe("13/08");
  });

  it("labels 3d/7d buckets as day + hour", () => {
    const t = new Date(2026, 7, 13, 5, 0, 0).getTime();
    expect(bucketLabel(t, "7d")).toBe("13 05h");
    expect(bucketLabel(t, "3d")).toBe("13 05h");
  });
});
