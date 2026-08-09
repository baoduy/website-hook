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
    const webhook = await db.createWebhook();

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
    const webhook = await db.createWebhook();

    const first = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: webhook.id }) });
    expect(first.status).toBe(204);

    const second = await DELETE(new Request("http://localhost"), { params: Promise.resolve({ id: webhook.id }) });
    expect(second.status).toBe(204);

    const info = await GET(new Request("http://localhost"), { params: Promise.resolve({ id: webhook.id }) });
    expect(info.status).toBe(404);
  });
});

describe("GET/DELETE /api/webhooks/:id — structured logging (DRK-280)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-info-log-"));
    dbPath = path.join(dir, "webhook.db");
    process.env.DB_PATH = dbPath;
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("logs a 200 GET as JSON with path/webhookId/clientIp and no body", async () => {
    const db = await import("@/lib/db");
    const { GET } = await import("./route");
    const webhook = await db.createWebhook();

    const res = await GET(new Request("http://localhost/api/webhooks/" + webhook.id, { headers: { "x-forwarded-for": "1.2.3.4" } }), {
      params: Promise.resolve({ id: webhook.id }),
    });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledOnce();

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe("/api/webhooks/" + webhook.id);
    expect(entry.status).toBe(200);
    expect(entry.webhookId).toBe(webhook.id);
    expect(entry.clientIp).toBe("1.2.3.4");
    expect(typeof entry.durationMs).toBe("number");
    expect("body" in entry).toBe(false);
  });

  it("logs a 404 GET for an unknown webhook to console.error", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/webhooks/unknown"), {
      params: Promise.resolve({ id: "unknown" }),
    });
    expect(res.status).toBe(404);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();

    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.status).toBe(404);
    expect(entry.webhookId).toBe("unknown");
  });

  it("logs a 204 DELETE as JSON with path/webhookId/clientIp and no body", async () => {
    const db = await import("@/lib/db");
    const { DELETE } = await import("./route");
    const webhook = await db.createWebhook();

    const res = await DELETE(new Request("http://localhost/api/webhooks/" + webhook.id, { method: "DELETE", headers: { "x-real-ip": "9.9.9.9" } }), {
      params: Promise.resolve({ id: webhook.id }),
    });
    expect(res.status).toBe(204);
    expect(logSpy).toHaveBeenCalledOnce();

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.method).toBe("DELETE");
    expect(entry.status).toBe(204);
    expect(entry.webhookId).toBe(webhook.id);
    expect(entry.clientIp).toBe("9.9.9.9");
    expect("body" in entry).toBe(false);
  });
});
