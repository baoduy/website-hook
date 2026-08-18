import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-traffic-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seed(webhookId: string, body?: Uint8Array<ArrayBuffer> | null) {
  const { ensureSchema, getClient } = await import("@/lib/prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  await prisma.webhook.create({
    data: { id: webhookId, createdAt: BigInt(Date.now()), lastActivityAt: BigInt(Date.now()), creatorIp: "" },
  });
  await prisma.capturedRequest.create({
    data: {
      id: crypto.randomUUID(),
      webhookId,
      createdAt: BigInt(Date.now()),
      method: "POST",
      path: "/",
      query: "",
      headers: "{}",
      body: body ?? null,
      truncated: false,
    },
  });
}

describe("GET /api/statistics/traffic", () => {
  it("returns the traffic document for the requested window", async () => {
    await seed("w1", new Uint8Array(64));
    const { GET } = await import("./route");

    const res = await GET(new NextRequest("http://localhost/api/statistics/traffic?window=7d"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.window).toBe("7d");
    expect(json.bucketSize).toBe("6h");
    expect(json.totalRequests).toBe(1);
    expect(json.buckets).toHaveLength(28);
  });

  it("defaults to 24h when no window is given", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/statistics/traffic"));
    expect((await res.json()).window).toBe("24h");
  });

  it("falls back to 24h for an unknown window value", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/statistics/traffic?window=bogus"));
    const json = await res.json();
    expect(json.window).toBe("24h");
    expect(json.bucketSize).toBe("1h");
  });

  it("reports an explicit empty state when the window has no traffic", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/api/statistics/traffic?window=24h"));
    const json = await res.json();
    expect(json.totalRequests).toBe(0);
    expect(json.methods).toEqual([]);
  });
});
