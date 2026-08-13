import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLEANUP_AGE_DAYS } from "@/lib/constants";

const DAY = 24 * 60 * 60 * 1000;
let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-cleanup-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedWebhook(id: string, daysAgo: number, requestCount: number) {
  const { ensureSchema, getClient } = await import("@/lib/prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  const createdAt = Date.now() - daysAgo * DAY;
  await prisma.webhook.create({
    data: { id, createdAt: BigInt(createdAt), lastActivityAt: BigInt(createdAt), creatorIp: "" },
  });
  for (let i = 0; i < requestCount; i++) {
    await prisma.capturedRequest.create({
      data: {
        id: crypto.randomUUID(),
        webhookId: id,
        createdAt: BigInt(createdAt),
        method: "GET",
        path: "/",
        query: "",
        headers: "{}",
        body: new Uint8Array(8),
        truncated: false,
      },
    });
  }
}

describe("GET /api/statistics/cleanup", () => {
  it("returns a preview naming only webhooks created over 30 days ago", async () => {
    await seedWebhook("7b19aa03", CLEANUP_AGE_DAYS + 14, 12);
    await seedWebhook("e3c1b7a4", 2, 3);
    const { GET } = await import("./route");

    const res = await GET(new NextRequest("http://localhost/api/statistics/cleanup"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12 });
  });
});

describe("DELETE /api/statistics/cleanup", () => {
  it("deletes only over-30-day webhooks, cascading their requests, and reports counts", async () => {
    await seedWebhook("7b19aa03", CLEANUP_AGE_DAYS + 14, 12);
    await seedWebhook("e3c1b7a4", 2, 3);
    const { DELETE } = await import("./route");

    const res = await DELETE(new NextRequest("http://localhost/api/statistics/cleanup", { method: "DELETE" }));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ deletedWebhooks: 1, deletedRequests: 12 });

    // The old webhook is gone (behaves as never existing); the recent one is untouched.
    const { ensureSchema, getClient } = await import("@/lib/prisma");
    const prisma = getClient();
    await ensureSchema(prisma);
    expect(await prisma.webhook.findUnique({ where: { id: "7b19aa03" } })).toBeNull();
    expect(await prisma.capturedRequest.count({ where: { webhookId: "7b19aa03" } })).toBe(0);
    expect(await prisma.webhook.findUnique({ where: { id: "e3c1b7a4" } })).not.toBeNull();
    expect(await prisma.capturedRequest.count({ where: { webhookId: "e3c1b7a4" } })).toBe(3);
  });

  it("deletes nothing when no webhook is old enough", async () => {
    await seedWebhook("e3c1b7a4", 9, 3);
    const { DELETE } = await import("./route");

    const res = await DELETE(new NextRequest("http://localhost/api/statistics/cleanup", { method: "DELETE" }));
    expect(await res.json()).toEqual({ deletedWebhooks: 0, deletedRequests: 0 });

    const { ensureSchema, getClient } = await import("@/lib/prisma");
    const prisma = getClient();
    await ensureSchema(prisma);
    expect(await prisma.webhook.findUnique({ where: { id: "e3c1b7a4" } })).not.toBeNull();
  });
});
