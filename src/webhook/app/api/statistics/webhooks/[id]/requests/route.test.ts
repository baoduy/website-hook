import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-req-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedWebhook(id: string, count: number) {
  const { ensureSchema, getClient } = await import("@/lib/prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  await prisma.webhook.create({
    data: { id, createdAt: BigInt(Date.now()), lastActivityAt: BigInt(Date.now()), creatorIp: "" },
  });
  for (let i = 0; i < count; i++) {
    await prisma.capturedRequest.create({
      data: {
        id: crypto.randomUUID(),
        webhookId: id,
        createdAt: BigInt(Date.now() + i),
        method: "POST",
        path: `/p/${i}`,
        query: "",
        headers: "{}",
        body: new Uint8Array(i),
        truncated: false,
      },
    });
  }
}

describe("GET /api/statistics/webhooks/:id/requests", () => {
  it("returns recent requests with method/path/time/size and the total, never body or headers", async () => {
    await seedWebhook("w1", 6);
    const { GET } = await import("./route");

    const res = await GET(new NextRequest("http://localhost/api/statistics/webhooks/w1/requests"), {
      params: Promise.resolve({ id: "w1" }),
    });
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.total).toBe(6);
    expect(json.items).toHaveLength(5); // default limit
    expect(json.items[0].path).toBe("/p/5"); // newest first
    expect(json.items[0].bodySize).toBe(5);
    expect("body" in json.items[0]).toBe(false);
    expect("headers" in json.items[0]).toBe(false);
  });

  it("honours an explicit limit and caps it at 100", async () => {
    await seedWebhook("w1", 3);
    const { GET } = await import("./route");

    const limited = await GET(new NextRequest("http://localhost/api/statistics/webhooks/w1/requests?limit=2"), {
      params: Promise.resolve({ id: "w1" }),
    });
    expect((await limited.json()).items).toHaveLength(2);

    const capped = await GET(new NextRequest("http://localhost/api/statistics/webhooks/w1/requests?limit=1000"), {
      params: Promise.resolve({ id: "w1" }),
    });
    expect((await capped.json()).items).toHaveLength(3); // capped at 100, only 3 stored
  });

  it("404s with a not_found body for an unknown webhook", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/statistics/webhooks/nope/requests"), {
      params: Promise.resolve({ id: "nope" }),
    });
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});
