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

  it("rate-limits creation past the shared per-IP limit", async () => {
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

  it("rate-limits a direct caller (no x-forwarded-for) past the per-caller quota", async () => {
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
