import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;
let logSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-get-req-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  errorSpy.mockRestore();
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/webhooks/:id/requests/:requestId", () => {
  it("returns the full captured request — method, headers, and body", async () => {
    const db = await import("@/lib/db");
    const { GET } = await import("./route");
    const webhook = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, {
      method: "PUT",
      path: "/sub/path",
      query: "a=b",
      headers: { "x-custom": "1" },
      body: Buffer.from("payload"),
      truncated: false,
    });
    const [stored] = (await db.listCapturedRequests(webhook.id, 1, null)).items;

    const res = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: webhook.id, requestId: stored.id }),
    });
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.method).toBe("PUT");
    expect(json.headers).toEqual({ "x-custom": "1" });
    expect(Buffer.from(json.body, "base64").toString()).toBe("payload");
  });

  it("404s for an unknown webhook or an unknown request id", async () => {
    const db = await import("@/lib/db");
    const { GET } = await import("./route");
    const webhook = await db.createWebhook();

    const unknownWebhook = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: "unknown", requestId: "x" }),
    });
    expect(unknownWebhook.status).toBe(404);

    const unknownRequest = await GET(new Request("http://localhost"), {
      params: Promise.resolve({ id: webhook.id, requestId: "unknown" }),
    });
    expect(unknownRequest.status).toBe(404);
  });
});

describe("GET /api/webhooks/:id/requests/:requestId — structured logging (DRK-280)", () => {
  it("logs a 200 response as JSON with path/webhookId/clientIp and no body", async () => {
    const db = await import("@/lib/db");
    const { GET } = await import("./route");
    const webhook = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, {
      method: "PUT",
      path: "/sub",
      query: "",
      headers: {},
      body: Buffer.from("payload"),
      truncated: false,
    });
    const [stored] = (await db.listCapturedRequests(webhook.id, 1, null)).items;

    const res = await GET(new Request(`http://localhost/api/webhooks/${webhook.id}/requests/${stored.id}`, { headers: { "x-forwarded-for": "1.2.3.4" } }), {
      params: Promise.resolve({ id: webhook.id, requestId: stored.id }),
    });
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledOnce();

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.method).toBe("GET");
    expect(entry.path).toBe(`/api/webhooks/${webhook.id}/requests/${stored.id}`);
    expect(entry.status).toBe(200);
    expect(entry.webhookId).toBe(webhook.id);
    expect(entry.clientIp).toBe("1.2.3.4");
    expect("body" in entry).toBe(false);
  });

  it("logs a 404 unknown webhook to console.error with the webhookId", async () => {
    const { GET } = await import("./route");
    const res = await GET(new Request("http://localhost/api/webhooks/unknown/requests/x"), {
      params: Promise.resolve({ id: "unknown", requestId: "x" }),
    });
    expect(res.status).toBe(404);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.status).toBe(404);
    expect(entry.webhookId).toBe("unknown");
  });
});
