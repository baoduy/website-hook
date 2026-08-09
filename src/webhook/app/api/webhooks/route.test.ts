import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CREATE_RATE_LIMIT, TTL_DAYS } from "@/lib/constants";

let dir: string;
let originalDisableRateLimit: string | undefined;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
  originalDisableRateLimit = process.env.DISABLE_RATE_LIMIT;
});

afterEach(() => {
  process.env.DISABLE_RATE_LIMIT = originalDisableRateLimit;
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("POST /api/webhooks", () => {
  it("creates a webhook and returns its capture URL and a 7-day expiry", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { host: "example.com" } });

    const res = await POST(req);
    const json = await res.json();

    expect(res.status).toBe(201);
    expect(json.id).toBeTruthy();
    expect(json.url).toBe(`http://example.com/${json.id}`);
    expect(json.expiresAt - json.createdAt).toBe(TTL_DAYS * 24 * 60 * 60 * 1000);
  });

  it("does NOT rate-limit when DISABLE_RATE_LIMIT is unset (default off — live-env scenario)", async () => {
    const { POST } = await import("./route");
    const req = () => new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { "x-forwarded-for": "1.1.1.1", host: "example.com" } });

    for (let i = 0; i < CREATE_RATE_LIMIT.max + 10; i++) {
      expect((await POST(req())).status).toBe(201);
    }
  });

  it("rate-limits creation past the shared per-IP limit when opted in via DISABLE_RATE_LIMIT=false", async () => {
    process.env.DISABLE_RATE_LIMIT = "false";
    const { POST } = await import("./route");
    const req = () => new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { "x-forwarded-for": "1.1.1.1", host: "example.com" } });

    for (let i = 0; i < CREATE_RATE_LIMIT.max; i++) {
      const res = await POST(req());
      expect(res.status).toBe(201);
    }

    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });

  it("rate-limits a direct caller (no x-forwarded-for) past the per-caller quota when opted in", async () => {
    process.env.DISABLE_RATE_LIMIT = "false";
    const { POST } = await import("./route");
    // A direct caller sends no forwarding headers; the same caller must still be capped at the
    // creation quota (DRK-213 security §5: the direct-caller fix must not create a new bypass).
    const req = () => new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { host: "example.com" } });

    for (let i = 0; i < CREATE_RATE_LIMIT.max; i++) {
      const res = await POST(req());
      expect(res.status).toBe(201);
    }

    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });

  it("honours DISABLE_RATE_LIMIT=true and bypasses the creation cap", async () => {
    process.env.DISABLE_RATE_LIMIT = "true";

    const { POST } = await import("./route");
    const req = () => new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { host: "example.com" } });

    for (let i = 0; i < CREATE_RATE_LIMIT.max + 5; i++) {
      const res = await POST(req());
      expect(res.status).toBe(201);
    }
  });

  it("treats DISABLE_RATE_LIMIT=false as enabled", async () => {
    process.env.DISABLE_RATE_LIMIT = "false";

    const { POST } = await import("./route");
    const req = () => new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { host: "example.com" } });

    for (let i = 0; i < CREATE_RATE_LIMIT.max; i++) {
      expect((await POST(req())).status).toBe(201);
    }

    const limited = await POST(req());
    expect(limited.status).toBe(429);
  });

  it("gives direct callers independent quotas — exhausting one direct caller does not block another", async () => {
    process.env.DISABLE_RATE_LIMIT = "false";
    const { POST } = await import("./route");
    // Two distinct direct callers (no forwarding headers). Caller A exhausts its quota; caller B
    // — a different connection — must still be able to create (DRK-213 R4 / acceptance scenario).
    // This requires the route to identify each direct caller by a stable per-connection identity.
    const directA = () => new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { host: "example.com", "x-test-caller": "A" } });
    const directB = () => new NextRequest("http://localhost/api/webhooks", { method: "POST", headers: { host: "example.com", "x-test-caller": "B" } });

    for (let i = 0; i < CREATE_RATE_LIMIT.max; i++) {
      expect((await POST(directA())).status).toBe(201);
    }
    expect((await POST(directA())).status).toBe(429); // A exhausted its own quota

    // B is a different direct caller and must not share A's bucket.
    expect((await POST(directB())).status).toBe(201);
  });
});

describe("POST /api/webhooks — structured logging (DRK-280)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;
  let originalDisableRateLimit: string | undefined;
  let originalDisableWebhookQuota: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-route-log-"));
    process.env.DB_PATH = path.join(dir, "webhook.db");
    originalDisableRateLimit = process.env.DISABLE_RATE_LIMIT;
    originalDisableWebhookQuota = process.env.DISABLE_WEBHOOK_QUOTA;
    delete process.env.DISABLE_RATE_LIMIT;
    delete process.env.DISABLE_WEBHOOK_QUOTA;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    if (originalDisableRateLimit === undefined) delete process.env.DISABLE_RATE_LIMIT;
    else process.env.DISABLE_RATE_LIMIT = originalDisableRateLimit;
    if (originalDisableWebhookQuota === undefined) delete process.env.DISABLE_WEBHOOK_QUOTA;
    else process.env.DISABLE_WEBHOOK_QUOTA = originalDisableWebhookQuota;
    logSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("logs a 201 creation as JSON with method/path/status/durationMs/webhookId/clientIp and no body", async () => {
    const { POST } = await import("./route");
    const req = new NextRequest("http://localhost/api/webhooks", {
      method: "POST",
      headers: { "x-forwarded-for": "203.0.113.9", host: "example.com" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(logSpy).toHaveBeenCalledOnce();
    expect(errorSpy).not.toHaveBeenCalled();

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.method).toBe("POST");
    expect(entry.path).toBe("/api/webhooks");
    expect(entry.status).toBe(201);
    expect(typeof entry.durationMs).toBe("number");
    expect(entry.webhookId).toBe((await res.json()).id);
    expect(entry.clientIp).toBe("203.0.113.9");
    expect("body" in entry).toBe(false);
  });

  it("logs a 429 rate_limited response to console.error with clientIp and no webhookId", async () => {
    process.env.DISABLE_RATE_LIMIT = "false";
    const { POST } = await import("./route");
    const req = () =>
      new NextRequest("http://localhost/api/webhooks", {
        method: "POST",
        headers: { "x-forwarded-for": "1.1.1.1", host: "example.com" },
      });

    for (let i = 0; i < CREATE_RATE_LIMIT.max; i++) await POST(req());
    errorSpy.mockClear();
    logSpy.mockClear();

    const limited = await POST(req());
    expect(limited.status).toBe(429);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();

    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.status).toBe(429);
    expect(entry.clientIp).toBe("1.1.1.1");
    expect("webhookId" in entry).toBe(false);
    expect("body" in entry).toBe(false);
  });
});
