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
});
