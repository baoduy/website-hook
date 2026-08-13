import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-list-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedWebhook(id: string, pathName: string, lastActivityAt?: number) {
  const { ensureSchema, getClient } = await import("@/lib/prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  await prisma.webhook.create({
    data: { id, createdAt: BigInt(Date.now()), lastActivityAt: BigInt(lastActivityAt ?? Date.now()), creatorIp: "" },
  });
  await prisma.capturedRequest.create({
    data: {
      id: crypto.randomUUID(),
      webhookId: id,
      createdAt: BigInt(Date.now()),
      method: "GET",
      path: pathName,
      query: "",
      headers: "{}",
      body: new Uint8Array(10),
      truncated: false,
    },
  });
}

describe("GET /api/statistics/webhooks", () => {
  it("returns the webhook list ordered most-recent-first", async () => {
    await seedWebhook("e3c1b7a4", "/stripe/events", Date.now() - 2 * 60 * 1000);
    await seedWebhook("9d40f2c8", "/health", Date.now() - 6 * 60 * 60 * 1000);
    const { GET } = await import("./route");

    const res = await GET(new NextRequest("http://localhost/api/statistics/webhooks"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(2);
    expect(json.items[0]).toMatchObject({ id: "e3c1b7a4", requestCount: 1, payloadBytes: 10 });
    expect(json.items[0].expiresAt).toBe(json.items[0].lastActivityAt + 7 * 24 * 60 * 60 * 1000);
  });

  it("narrows by the q filter (id or captured path)", async () => {
    await seedWebhook("e3c1b7a4", "/stripe/events");
    await seedWebhook("9d40f2c8", "/health");
    const { GET } = await import("./route");

    const byId = await GET(new NextRequest("http://localhost/api/statistics/webhooks?q=e3c1"));
    expect((await byId.json()).items.map((i: { id: string }) => i.id)).toEqual(["e3c1b7a4"]);

    const byPath = await GET(new NextRequest("http://localhost/api/statistics/webhooks?q=stripe"));
    expect((await byPath.json()).items.map((i: { id: string }) => i.id)).toEqual(["e3c1b7a4"]);
  });

  it("returns an empty list when the filter matches nothing", async () => {
    await seedWebhook("e3c1b7a4", "/stripe/events");
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/statistics/webhooks?q=zzz"));
    expect(await res.json()).toEqual({ items: [] });
  });
});
