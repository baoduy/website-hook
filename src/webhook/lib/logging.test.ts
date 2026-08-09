import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getRequestPath, logRequest } from "./logging";

// QC verification (DRK-280): structured API request logging for Cloudflare observability.
// Every API route emits one JSON line per request with method/path/status/durationMs plus the
// optional webhookId/clientIp. Request and response bodies are NEVER part of the entry (spec R5).

describe("getRequestPath", () => {
  it("extracts the pathname from a request URL", () => {
    expect(getRequestPath({ url: "http://localhost/api/webhooks/abc?limit=2" })).toBe("/api/webhooks/abc");
  });

  it("returns the path for a capture route with a sub-path", () => {
    expect(getRequestPath({ url: "https://hook.example/abc/orders/42" })).toBe("/abc/orders/42");
  });

  it("returns an empty string when the URL is unparseable", () => {
    expect(getRequestPath({ url: "not-a-url" })).toBe("");
  });
});

describe("logRequest", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("emits one JSON line with the required fields for a successful request", () => {
    logRequest("GET", "/api/webhooks/abc", 200, 12);

    expect(logSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry).toEqual({ method: "GET", path: "/api/webhooks/abc", status: 200, durationMs: 12 });
  });

  it("includes webhookId and clientIp only when provided", () => {
    logRequest("POST", "/api/webhooks", 201, 5, { webhookId: "wh-1", clientIp: "203.0.113.7" });

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry).toEqual({
      method: "POST",
      path: "/api/webhooks",
      status: 201,
      durationMs: 5,
      webhookId: "wh-1",
      clientIp: "203.0.113.7",
    });
  });

  it("omits webhookId/clientIp keys entirely when the meta is empty", () => {
    logRequest("GET", "/api/webhooks/abc", 200, 3);

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect("webhookId" in entry).toBe(false);
    expect("clientIp" in entry).toBe(false);
  });

  it("omits a meta key when its value is falsy", () => {
    logRequest("GET", "/abc", 200, 1, { webhookId: "", clientIp: undefined });

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect("webhookId" in entry).toBe(false);
    expect("clientIp" in entry).toBe(false);
  });

  it.each([404, 429, 500, 503])("routes status %i to console.error", (status) => {
    logRequest("GET", "/x", status, 9);

    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.status).toBe(status);
  });

  it.each([200, 201, 204, 301, 399])("routes status %i to console.log", (status) => {
    logRequest("GET", "/x", status, 9);

    expect(logSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  it("never includes a body, request or response, in the log entry", () => {
    logRequest("POST", "/capture", 200, 7, { webhookId: "w" });

    const raw = logSpy.mock.calls[0][0] as string;
    expect(raw).not.toMatch(/body/i);
    const entry = JSON.parse(raw);
    const keys = Object.keys(entry);
    expect(keys).not.toContain("body");
    expect(keys).not.toContain("requestBody");
    expect(keys).not.toContain("responseBody");
    expect(keys).not.toContain("headers");
  });
});