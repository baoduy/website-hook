import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-get-req-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
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
