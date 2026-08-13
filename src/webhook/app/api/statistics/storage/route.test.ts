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
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-storage-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("GET /api/statistics/storage", () => {
  it("returns the storage totals document", async () => {
    const { ensureSchema, getClient } = await import("@/lib/prisma");
    const prisma = getClient();
    await ensureSchema(prisma);
    const oldCutoff = Date.now() - CLEANUP_AGE_DAYS * DAY;
    await prisma.webhook.create({
      data: { id: "old", createdAt: BigInt(oldCutoff - 14 * DAY), lastActivityAt: BigInt(oldCutoff - 14 * DAY), creatorIp: "" },
    });
    await prisma.webhook.create({
      data: { id: "new", createdAt: BigInt(Date.now()), lastActivityAt: BigInt(Date.now()), creatorIp: "" },
    });
    await prisma.capturedRequest.create({
      data: {
        id: crypto.randomUUID(),
        webhookId: "old",
        createdAt: BigInt(oldCutoff - 14 * DAY),
        method: "GET",
        path: "/",
        query: "",
        headers: "{}",
        body: new Uint8Array(100),
        truncated: false,
      },
    });

    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/statistics/storage"));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      webhooks: 2,
      capturedRequests: 1,
      oldWebhooks: 1,
      oldRequests: 1,
      oldBytes: 100,
    });
  });

  it("reports zero totals for an empty store", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/statistics/storage"));
    expect(await res.json()).toEqual({
      webhooks: 0,
      capturedRequests: 0,
      oldWebhooks: 0,
      oldRequests: 0,
      oldBytes: 0,
    });
  });
});
