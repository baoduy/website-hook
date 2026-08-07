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
