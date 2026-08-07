import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CREATE_RATE_LIMIT, TTL_DAYS } from "@/lib/constants";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
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
});
