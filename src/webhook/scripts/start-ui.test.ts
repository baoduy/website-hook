import { describe, expect, it } from "vitest";
import { forwardHeaders, isUiPath, parseApiUrl } from "./start-ui.mjs";

// Acceptance tests — DRK-2086 §6 rules R1–R4 and §6a rows D1, D2, D3, D6 at the UI forwarder's
// pure seam. Expected values are literals from the spec and the brief.

const API_URL_MAX = 2048;
const httpUrlOfLength = (length: number) => {
  const base = "http://website-hook-api:3000/";
  return base + "a".repeat(length - base.length);
};

describe("parseApiUrl — the UI refuses to start without a valid API address (D1)", () => {
  it.each([
    ["missing", undefined],
    ["empty", ""],
    ["without a scheme", "website-hook-api:3000"],
    ["not http or https", "ftp://website-hook-api:3000"],
    ["longer than 2048 characters", httpUrlOfLength(API_URL_MAX + 1)],
  ])("rejects an API address that is %s, naming WEBHOOK_API_URL", (_label, value) => {
    // The spec only requires the error to name the setting, so the message is matched on that name.
    expect(() => parseApiUrl(value)).toThrow("WEBHOOK_API_URL");
  });
});

describe("parseApiUrl — valid API addresses are accepted (D2)", () => {
  it.each([
    ["over http", "http://website-hook-api:3000", "http://website-hook-api:3000"],
    ["over https", "https://website-hook-api:3000", "https://website-hook-api:3000"],
    ["with a trailing slash", "http://website-hook-api:3000/", "http://website-hook-api:3000"],
    ["with a path", "http://website-hook-api:3000/hooks", "http://website-hook-api:3000"],
  ])("accepts an API address %s and keeps its origin", (_label, value, origin) => {
    expect(parseApiUrl(value).origin).toBe(origin);
  });

  it("accepts an address of exactly 2048 characters", () => {
    const value = httpUrlOfLength(API_URL_MAX);

    expect(value).toHaveLength(2048);
    expect(parseApiUrl(value).origin).toBe("http://website-hook-api:3000");
  });
});

describe("isUiPath — only the UI pages and assets stay in the UI (R1, D6)", () => {
  it.each([
    ["/", true],
    ["/status", true],
    ["/_next/x.js", true],
    ["/status/x", false],
    ["/7f3c2a10-0000-4000-8000-000000000001", false],
    ["/api/webhooks", false],
    ["/openapi.json", false],
  ])("%s → UI is %s", (pathname, expected) => {
    expect(isUiPath(pathname)).toBe(expected);
  });
});

describe("forwardHeaders — a caller cannot fake its address through the UI (R3, D3)", () => {
  const SOCKET_ADDRESS = "203.0.113.7";

  it.each([
    ["x-forwarded-for", { "x-forwarded-for": "198.51.100.9" }],
    ["x-real-ip", { "x-real-ip": "198.51.100.9" }],
    ["both", { "x-forwarded-for": "198.51.100.9", "x-real-ip": "198.51.100.10" }],
    ["neither", {}],
    ["forwarded", { forwarded: "for=198.51.100.9" }],
  ])("the API sees only the socket address when the caller sends %s", (_label, claimed) => {
    const headers = forwardHeaders({ host: "localhost:8080", ...claimed }, SOCKET_ADDRESS);

    expect(headers["x-forwarded-for"]).toBe("203.0.113.7");
    expect(headers["x-real-ip"]).toBeUndefined();
    expect(headers["forwarded"]).toBeUndefined();
  });

  it("keeps the caller's host header so responses name the UI address", () => {
    const headers = forwardHeaders({ host: "localhost:8080" }, SOCKET_ADDRESS);

    expect(headers["host"]).toBe("localhost:8080");
  });

  it("keeps the caller's x-forwarded-proto", () => {
    const headers = forwardHeaders({ host: "localhost:8080", "x-forwarded-proto": "https" }, SOCKET_ADDRESS);

    expect(headers["x-forwarded-proto"]).toBe("https");
  });

  it("sets x-forwarded-proto to http when the caller sent none", () => {
    const headers = forwardHeaders({ host: "localhost:8080" }, SOCKET_ADDRESS);

    expect(headers["x-forwarded-proto"]).toBe("http");
  });

  it("passes every other header through unchanged", () => {
    const headers = forwardHeaders(
      { host: "localhost:8080", "content-type": "application/json", "x-order-id": "ord-1001" },
      SOCKET_ADDRESS,
    );

    expect(headers["content-type"]).toBe("application/json");
    expect(headers["x-order-id"]).toBe("ord-1001");
  });
});
