import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;
let dbPath: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-info-"));
  dbPath = path.join(dir, "webhook.db");
  process.env.DB_PATH = dbPath;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/webhooks/:id", () => {
  it("reports creation time, last activity, request count, and expiry", async () => {
    const db = await import("@/lib/db");
    const { GET } = await import("./route");
    const webhook = db.createWebhook();

    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: webhook.id }) });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json).toEqual({
      id: webhook.id,
      createdAt: webhook.createdAt,
      lastActivityAt: webhook.lastActivityAt,
      requestCount: 0,
      expiresAt: webhook.expiresAt,
    });
  });

  it("404s for an unknown webhook", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: "unknown" }) });
    expect(res.status).toBe(404);
  });
});

describe("DELETE /api/webhooks/:id", () => {
  it("deletes a webhook, and is idempotent when called again on the same id", async () => {
    const db = await import("@/lib/db");
    const { DELETE, GET } = await import("./route");
    const webhook = db.createWebhook();

    const first = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: webhook.id }) });
    expect(first.status).toBe(204);

    const second = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: webhook.id }) });
    expect(second.status).toBe(204);

    const info = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: webhook.id }) });
    expect(info.status).toBe(404);
  });
});
