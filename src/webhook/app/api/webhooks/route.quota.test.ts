import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TTL_DAYS } from "@/lib/constants";

// QC verification (DRK-275): end-to-end quota enforcement against the real SQLite store.
// These run in-process on the same vitest harness as the unit suite. The quota is opted in
// explicitly per test via WEBHOOK_QUOTA / DISABLE_WEBHOOK_QUOTA, because the in-process test
// seam (getWebhookQuota under NODE_ENV=test) leaves the quota disabled when WEBHOOK_QUOTA is
// unset — so the legacy rate-limit suite stays unblocked. Every scenario here pins the quota on.

let dir: string;
let originalWebhookQuota: string | undefined;
let originalDisableWebhookQuota: string | undefined;
let originalDisableRateLimit: string | undefined;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-quota-route-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
  originalWebhookQuota = process.env.WEBHOOK_QUOTA;
  originalDisableWebhookQuota = process.env.DISABLE_WEBHOOK_QUOTA;
  originalDisableRateLimit = process.env.DISABLE_RATE_LIMIT;
  delete process.env.WEBHOOK_QUOTA;
  delete process.env.DISABLE_WEBHOOK_QUOTA;
  delete process.env.DISABLE_RATE_LIMIT;
});

afterEach(() => {
  if (originalWebhookQuota === undefined) delete process.env.WEBHOOK_QUOTA;
  else process.env.WEBHOOK_QUOTA = originalWebhookQuota;
  if (originalDisableWebhookQuota === undefined) delete process.env.DISABLE_WEBHOOK_QUOTA;
  else process.env.DISABLE_WEBHOOK_QUOTA = originalDisableWebhookQuota;
  if (originalDisableRateLimit === undefined) delete process.env.DISABLE_RATE_LIMIT;
  else process.env.DISABLE_RATE_LIMIT = originalDisableRateLimit;
  fs.rmSync(dir, { recursive: true, force: true });
});

const IP_A = "203.0.113.7";
const IP_B = "198.51.100.22";

function createFromIp(ip: string): NextRequest {
  return new NextRequest("http://localhost/api/webhooks", {
    method: "POST",
    headers: { "x-forwarded-for": ip, host: "example.com" },
  });
}

function createViaRealIp(ip: string): NextRequest {
  return new NextRequest("http://localhost/api/webhooks", {
    method: "POST",
    headers: { "x-real-ip": ip, host: "example.com" },
  });
}

async function activeCount(ip: string): Promise<number> {
  const db = await import("@/lib/db");
  return db.countActiveWebhooksByIp(ip);
}

/** Rewrites last_activity_at directly, simulating a webhook idle past its TTL without the sweep. */
async function expireLastCreated(ip: string): Promise<void> {
  const { ensureSchema, getClient } = await import("@/lib/prisma");
  const db = await import("@/lib/db");
  const id = (await db.countActiveWebhooksByIp(ip)) > 0 ? (await lastWebhookIdFor(ip)) : null;
  if (!id) throw new Error("no webhook to expire");
  const prisma = getClient();
  await ensureSchema(prisma);
  await prisma.webhook.update({
    where: { id },
    data: { lastActivityAt: BigInt(Date.now() - (TTL_DAYS + 1) * 24 * 60 * 60 * 1000) },
  });
}

async function lastWebhookIdFor(ip: string): Promise<string | null> {
  const { ensureSchema, getClient } = await import("@/lib/prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  const rows = (await prisma.$queryRawUnsafe<{ id: string }[]>(
    "SELECT id FROM webhooks WHERE creator_ip = ? ORDER BY created_at DESC LIMIT 1",
    ip,
  )) as unknown as { id: string }[];
  return rows[0]?.id ?? null;
}

describe("POST /api/webhooks — per-IP quota (integration)", () => {
  it("rejects the 6th creation from one IP with quota_exceeded and creates no webhook", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }

    const rejected = await POST(createFromIp(IP_A));
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toEqual({ error: "quota_exceeded" });
    // The rejected request must not have created a webhook row.
    expect(await activeCount(IP_A)).toBe(5);
  });

  it("enforces the quota per client IP — a second IP is unaffected", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
    expect((await POST(createFromIp(IP_A))).status).toBe(429);

    // A different caller gets its own bucket — quota is per IP, not global.
    expect((await POST(createFromIp(IP_B))).status).toBe(201);
    expect(await activeCount(IP_B)).toBe(1);
  });

  it("frees a quota slot on deletion — the next creation from the same IP succeeds", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
    expect((await POST(createFromIp(IP_A))).status).toBe(429);

    // Delete one of the held webhooks — the freed slot must allow a new creation.
    const firstId = (await lastWebhookIdFor(IP_A))!;
    const { deleteWebhook } = await import("@/lib/db");
    await deleteWebhook(firstId);

    expect((await POST(createFromIp(IP_A))).status).toBe(201);
    expect(await activeCount(IP_A)).toBe(5);
  });

  it("frees a quota slot when a held webhook expires (even before the sweep runs)", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
    expect((await POST(createFromIp(IP_A))).status).toBe(429);

    // Expire one row directly — the quota count must drop immediately, not only after the purge.
    await expireLastCreated(IP_A);

    expect((await POST(createFromIp(IP_A))).status).toBe(201);
    expect(await activeCount(IP_A)).toBe(5);
  });

  it("honours a custom quota number end to end", async () => {
    process.env.WEBHOOK_QUOTA = "2";
    const { POST } = await import("./route");

    expect((await POST(createFromIp(IP_A))).status).toBe(201);
    expect((await POST(createFromIp(IP_A))).status).toBe(201);
    const rejected = await POST(createFromIp(IP_A));
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toEqual({ error: "quota_exceeded" });
  });

  it("honours the quota disabled via WEBHOOK_QUOTA=disabled — 10 creations all succeed", async () => {
    process.env.WEBHOOK_QUOTA = "disabled";
    const { POST } = await import("./route");

    for (let i = 0; i < 10; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
    expect(await activeCount(IP_A)).toBe(10);
  });

  it("honours the quota disabled via WEBHOOK_QUOTA=0", async () => {
    process.env.WEBHOOK_QUOTA = "0";
    const { POST } = await import("./route");

    for (let i = 0; i < 8; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
  });

  it("honours DISABLE_WEBHOOK_QUOTA=true (takes precedence over an explicit WEBHOOK_QUOTA)", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    process.env.DISABLE_WEBHOOK_QUOTA = "true";
    const { POST } = await import("./route");

    for (let i = 0; i < 10; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
  });

  it("treats DISABLE_WEBHOOK_QUOTA=false as enabled — quota still enforced", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    process.env.DISABLE_WEBHOOK_QUOTA = "false";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
    expect((await POST(createFromIp(IP_A))).status).toBe(429);
  });
});

describe("POST /api/webhooks — x-real-ip identity (integration)", () => {
  it("resolves the caller from x-real-ip when x-forwarded-for is absent, and quotas it", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) {
      expect((await POST(createViaRealIp(IP_A))).status).toBe(201);
    }
    const rejected = await POST(createViaRealIp(IP_A));
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toEqual({ error: "quota_exceeded" });
  });

  it("keeps x-forwarded-for and x-real-ip callers in separate buckets", async () => {
    process.env.WEBHOOK_QUOTA = "1";
    const { POST } = await import("./route");

    expect((await POST(createFromIp(IP_A))).status).toBe(201);
    // Same IP value but resolved via a different header path — still the same identity bucket,
    // so this exceeds the quota of 1.
    expect((await POST(createViaRealIp(IP_A))).status).toBe(429);
  });
});

describe("POST /api/webhooks — quota / rate-limit independence (integration)", () => {
  it("keeps the rate limit enforcing when the quota is disabled", async () => {
    process.env.DISABLE_WEBHOOK_QUOTA = "true";
    // rate limit stays on (CREATE_RATE_LIMIT.max = 20)
    const { POST } = await import("./route");

    for (let i = 0; i < 20; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
    const limited = await POST(createFromIp(IP_A));
    expect(limited.status).toBe(429);
    expect(await limited.json()).toEqual({ error: "rate_limited" });
  });

  it("keeps the quota enforcing when the rate limit is disabled", async () => {
    process.env.DISABLE_RATE_LIMIT = "true";
    process.env.WEBHOOK_QUOTA = "5";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) {
      expect((await POST(createFromIp(IP_A))).status).toBe(201);
    }
    const rejected = await POST(createFromIp(IP_A));
    expect(rejected.status).toBe(429);
    expect(await rejected.json()).toEqual({ error: "quota_exceeded" });
  });

  it("returns the quota_exceeded signal (distinct from rate_limited) so clients can distinguish", async () => {
    process.env.WEBHOOK_QUOTA = "5";
    const { POST } = await import("./route");

    for (let i = 0; i < 5; i++) await POST(createFromIp(IP_A));

    const quotaHit = await POST(createFromIp(IP_A));
    expect(quotaHit.status).toBe(429);
    expect(await quotaHit.json()).toEqual({ error: "quota_exceeded" });
  });
});