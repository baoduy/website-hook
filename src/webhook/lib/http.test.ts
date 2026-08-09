import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp } from "./http";

describe("getClientIp", () => {
  it("uses the first IP from x-forwarded-for when present", () => {
    const request = new NextRequest("http://localhost/api/webhooks", {
      headers: { "x-forwarded-for": "1.1.1.1, 2.2.2.2" },
    });

    expect(getClientIp(request)).toBe("1.1.1.1");
  });

  it("returns independent keys for distinct direct callers without x-forwarded-for", () => {
    const a = getClientIp(
      new NextRequest("http://localhost/api/webhooks", { headers: { "x-test-caller": "A" } }),
    );
    const b = getClientIp(
      new NextRequest("http://localhost/api/webhooks", { headers: { "x-test-caller": "B" } }),
    );

    expect(a).toMatch(/^direct:/);
    expect(b).toMatch(/^direct:/);
    expect(a).not.toBe(b);
  });

  it("returns a stable key for a direct caller with no identifying header", () => {
    const a = getClientIp(new NextRequest("http://localhost/api/webhooks"));
    const b = getClientIp(new NextRequest("http://localhost/api/webhooks"));

    expect(a).toBe("direct:default");
    expect(b).toBe("direct:default");
  });

  // QC verification (DRK-275): identity resolution order (spec D2 / DRK-272 R4) —
  // x-forwarded-for first hop, then the x-real-ip fallback requested in this ticket,
  // then the existing last-resort seam. The quota and the rate limit share this one identity.

  it("falls back to x-real-ip when x-forwarded-for is absent", () => {
    const request = new NextRequest("http://localhost/api/webhooks", {
      headers: { "x-real-ip": "203.0.113.7" },
    });

    expect(getClientIp(request)).toBe("203.0.113.7");
  });

  it("ignores an empty x-real-ip header and falls through to the last-resort identity", () => {
    const request = new NextRequest("http://localhost/api/webhooks", {
      headers: { "x-real-ip": "  " },
    });

    expect(getClientIp(request)).toBe("direct:default");
  });

  it("trims whitespace around x-real-ip", () => {
    const request = new NextRequest("http://localhost/api/webhooks", {
      headers: { "x-real-ip": "  198.51.100.22  " },
    });

    expect(getClientIp(request)).toBe("198.51.100.22");
  });

  it("prefers x-forwarded-for over x-real-ip when both are present", () => {
    const request = new NextRequest("http://localhost/api/webhooks", {
      headers: { "x-forwarded-for": "1.1.1.1", "x-real-ip": "203.0.113.7" },
    });

    expect(getClientIp(request)).toBe("1.1.1.1");
  });

  it("does not let x-real-ip leak into a distinct direct caller's identity bucket", () => {
    const realA = getClientIp(
      new NextRequest("http://localhost/api/webhooks", { headers: { "x-real-ip": "203.0.113.7" } }),
    );
    const realB = getClientIp(
      new NextRequest("http://localhost/api/webhooks", { headers: { "x-real-ip": "198.51.100.22" } }),
    );

    expect(realA).toBe("203.0.113.7");
    expect(realB).toBe("198.51.100.22");
    expect(realA).not.toBe(realB);
  });
});
