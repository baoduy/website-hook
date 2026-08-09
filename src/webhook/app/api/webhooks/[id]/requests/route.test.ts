import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-list-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/webhooks/:id/requests", () => {
  it("lists captured requests newest-first, paginated by cursor", async () => {
    const db = await import("@/lib/db");
    const { GET } = await import("./route");
    const webhook = await db.createWebhook();
    for (let i = 0; i < 3; i++) {
      await db.insertCapturedRequest(webhook.id, { method: "GET", path: `/${i}`, query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    }

    const firstPage = await GET(new NextRequest(`http://localhost/api/webhooks/${webhook.id}/requests?limit=2`), {
      params: Promise.resolve({ id: webhook.id }),
    });
    const firstJson = await firstPage.json();
    expect(firstJson.items.map((i: { path: string }) => i.path)).toEqual(["/2", "/1"]);
    expect(firstJson.nextCursor).toBeTruthy();

    const secondPage = await GET(
      new NextRequest(`http://localhost/api/webhooks/${webhook.id}/requests?limit=2&cursor=${firstJson.nextCursor}`),
      { params: Promise.resolve({ id: webhook.id }) },
    );
    const secondJson = await secondPage.json();
    expect(secondJson.items.map((i: { path: string }) => i.path)).toEqual(["/0"]);
    expect(secondJson.nextCursor).toBeNull();
  });

  it("404s for an unknown webhook", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/webhooks/unknown/requests"), {
      params: Promise.resolve({ id: "unknown" }),
    });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/webhooks/:id/requests — structured logging (DRK-280)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-list-log-"));
    process.env.DB_PATH = path.join(dir, "webhook.db");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("logs a 200 list response as JSON with path/webhookId/clientIp and no body", async () => {
    const db = await import("@/lib/db");
    const { GET } = await import("./route");
    const webhook = await db.createWebhook();

    const res = await GET(new NextRequest(`http://localhost/api/webhooks/${webhook.id}/requests?limit=2`, { headers: { "x-forwarded-for": "5.6.7.8" } }), {
      params: Promise.resolve({ id: webhook.id }),
    });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledOnce();

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe(`/api/webhooks/${webhook.id}/requests`);
    expect(entry.status).toBe(200);
    expect(entry.webhookId).toBe(webhook.id);
    expect(entry.clientIp).toBe("5.6.7.8");
    expect("body" in entry).toBe(false);
  });

  it("logs a 404 for an unknown webhook to console.error", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/webhooks/unknown/requests"), {
      params: Promise.resolve({ id: "unknown" }),
    });
    expect(res.status).toBe(404);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.status).toBe(404);
    expect(entry.webhookId).toBe("unknown");
  });
});
