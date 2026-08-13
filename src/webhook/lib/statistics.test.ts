import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { CLEANUP_AGE_DAYS, TTL_DAYS } from "./constants";

const DAY = 24 * 60 * 60 * 1000;
const TTL_MS = TTL_DAYS * DAY;

let dir: string;
let stats: typeof import("./statistics");

beforeEach(async () => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-stats-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
  stats = await import("./statistics");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Inserts a webhook with explicit timestamps (defaults to "now"), bypassing lib/db. */
async function seedWebhook(opts: { id?: string; createdAt?: number; lastActivityAt?: number } = {}): Promise<string> {
  const { ensureSchema, getClient } = await import("./prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  const now = Date.now();
  const id = opts.id ?? crypto.randomUUID();
  await prisma.webhook.create({
    data: {
      id,
      createdAt: BigInt(opts.createdAt ?? now),
      lastActivityAt: BigInt(opts.lastActivityAt ?? now),
      creatorIp: "",
    },
  });
  return id;
}

/** Inserts a captured request with explicit timestamp/body (defaults to "now", empty body). */
async function seedRequest(
  webhookId: string,
  opts: { createdAt?: number; method?: string; path?: string; body?: Uint8Array<ArrayBuffer> | null; truncated?: boolean } = {},
): Promise<void> {
  const { ensureSchema, getClient } = await import("./prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  await prisma.capturedRequest.create({
    data: {
      id: crypto.randomUUID(),
      webhookId,
      createdAt: BigInt(opts.createdAt ?? Date.now()),
      method: opts.method ?? "POST",
      path: opts.path ?? "/",
      query: "",
      headers: "{}",
      body: opts.body ?? null,
      truncated: opts.truncated ?? false,
    },
  });
}

describe("resolveWindow", () => {
  it.each(["24h", "3d", "7d", "30d"])("keeps the known window %s", (w) => {
    expect(stats.resolveWindow(w)).toBe(w);
  });

  it("falls back to 24h for a null window", () => {
    expect(stats.resolveWindow(null)).toBe("24h");
  });

  it.each(["86400", "hour", "", "1d"])("falls back to 24h for unknown value %q", (w) => {
    expect(stats.resolveWindow(w)).toBe("24h");
  });
});

describe("getTraffic — window and bucket geometry", () => {
  it.each([
    ["24h", "1h", 24],
    ["3d", "3h", 24],
    ["7d", "6h", 28],
    ["30d", "1d", 30],
  ] as const)("window %s uses %s buckets — %d of them", async (window, bucketSize, count) => {
    const traffic = await stats.getTraffic(window);
    expect(traffic.window).toBe(window);
    expect(traffic.bucketSize).toBe(bucketSize);
    expect(traffic.buckets).toHaveLength(count);
    expect(traffic.totalRequests).toBe(0);
  });

  it("reports an explicit empty state — every figure zero and no methods", async () => {
    const traffic = await stats.getTraffic("24h");
    expect(traffic.totalRequests).toBe(0);
    expect(traffic.busiestBucket).toBe(0);
    expect(traffic.averagePerDay).toBe(0);
    expect(traffic.activeWebhooks).toBe(0);
    expect(traffic.totalWebhooks).toBe(0);
    expect(traffic.payloadBytes).toBe(0);
    expect(traffic.averageBodyBytes).toBe(0);
    expect(traffic.largestBodyBytes).toBe(0);
    expect(traffic.emptyBodies).toBe(0);
    expect(traffic.truncatedBodies).toBe(0);
    expect(traffic.methods).toEqual([]);
    expect(traffic.buckets.every((b) => b.count === 0)).toBe(true);
  });
});

describe("getTraffic — volume, method mix, payload profile", () => {
  it("totals requests, reports the busiest bucket, and active-vs-total webhooks", async () => {
    const a = await seedWebhook();
    const b = await seedWebhook();
    const now = Date.now();
    // 31 requests to webhook A in the current hour bucket, 10 to webhook B three hours earlier.
    for (let i = 0; i < 31; i++) await seedRequest(a, { createdAt: now, method: "GET" });
    for (let i = 0; i < 10; i++) await seedRequest(b, { createdAt: now - 3 * 60 * 60 * 1000, method: "GET" });

    const traffic = await stats.getTraffic("24h");
    expect(traffic.totalRequests).toBe(41);
    expect(traffic.busiestBucket).toBe(31);
    expect(traffic.activeWebhooks).toBe(2);
    expect(traffic.totalWebhooks).toBe(2);
    expect(traffic.averagePerDay).toBe(41); // 24h window: rate == volume
  });

  it("orders the method mix heaviest-first with rounded percentages", async () => {
    const w = await seedWebhook();
    const now = Date.now();
    for (let i = 0; i < 60; i++) await seedRequest(w, { createdAt: now, method: "POST" });
    for (let i = 0; i < 30; i++) await seedRequest(w, { createdAt: now, method: "GET" });
    for (let i = 0; i < 10; i++) await seedRequest(w, { createdAt: now, method: "DELETE" });

    const traffic = await stats.getTraffic("24h");
    expect(traffic.methods).toEqual([
      { method: "POST", count: 60, percentage: 60 },
      { method: "GET", count: 30, percentage: 30 },
      { method: "DELETE", count: 10, percentage: 10 },
    ]);
  });

  it("reports payload totals, average (total/requests incl. empty bodies), largest body and empty count", async () => {
    const w = await seedWebhook();
    const now = Date.now();
    await seedRequest(w, { createdAt: now, body: new Uint8Array(100) });
    await seedRequest(w, { createdAt: now, body: new Uint8Array(200) });
    await seedRequest(w, { createdAt: now, body: new Uint8Array(300) });
    await seedRequest(w, { createdAt: now, body: null }); // empty body

    const traffic = await stats.getTraffic("24h");
    expect(traffic.totalRequests).toBe(4);
    expect(traffic.payloadBytes).toBe(600);
    expect(traffic.averageBodyBytes).toBe(150); // 600 / 4
    expect(traffic.largestBodyBytes).toBe(300);
    expect(traffic.emptyBodies).toBe(1);
  });

  it("counts a zero-length body as empty too", async () => {
    const w = await seedWebhook();
    await seedRequest(w, { body: new Uint8Array(0) });

    const traffic = await stats.getTraffic("24h");
    expect(traffic.emptyBodies).toBe(1);
    expect(traffic.payloadBytes).toBe(0);
  });

  it("counts bodies truncated at the 1 MB capture limit", async () => {
    const w = await seedWebhook();
    const oneMb = new Uint8Array(1_048_576);
    for (let i = 0; i < 4; i++) await seedRequest(w, { body: oneMb, truncated: true });

    const traffic = await stats.getTraffic("24h");
    expect(traffic.truncatedBodies).toBe(4);
    expect(traffic.largestBodyBytes).toBe(1_048_576);
    expect(traffic.payloadBytes).toBe(4 * 1_048_576);
  });

  it("reports 9 of 26 stored webhooks active and a 90/day average across a 7-day window", async () => {
    const active = [] as string[];
    for (let i = 0; i < 26; i++) {
      const id = await seedWebhook();
      if (i < 9) active.push(id);
    }
    // 630 requests spread over the 9 active webhooks, all inside the window.
    const now = Date.now();
    for (let i = 0; i < 630; i++) {
      await seedRequest(active[i % 9], { createdAt: now, method: "GET" });
    }

    const traffic = await stats.getTraffic("7d");
    expect(traffic.totalRequests).toBe(630);
    expect(traffic.activeWebhooks).toBe(9);
    expect(traffic.totalWebhooks).toBe(26);
    expect(traffic.averagePerDay).toBe(90); // 630 / 7 days
  });
});

describe("getStorage", () => {
  it("reports stored totals and the volume held by webhooks created over 30 days ago", async () => {
    const oldCutoff = Date.now() - CLEANUP_AGE_DAYS * DAY;
    // 3 old webhooks created 44 days ago, holding 512 requests of 16 KB each.
    for (let i = 0; i < 3; i++) {
      const id = await seedWebhook({ createdAt: oldCutoff - 14 * DAY });
      const body = new Uint8Array(16 * 1024);
      for (let j = 0; j < 512; j++) await seedRequest(id, { createdAt: oldCutoff - 14 * DAY, body });
    }
    // 23 recent webhooks, one request each.
    for (let i = 0; i < 23; i++) {
      const id = await seedWebhook();
      await seedRequest(id, { body: new Uint8Array(100) });
    }

    const storage = await stats.getStorage();
    expect(storage.webhooks).toBe(26);
    expect(storage.capturedRequests).toBe(3 * 512 + 23);
    expect(storage.oldWebhooks).toBe(3);
    expect(storage.oldRequests).toBe(3 * 512);
    expect(storage.oldBytes).toBe(3 * 512 * 16 * 1024);
  });

  it("reports zero old data when nothing is over 30 days old", async () => {
    await seedWebhook();
    await seedRequest(await seedWebhook(), { body: new Uint8Array(50) });

    const storage = await stats.getStorage();
    expect(storage.webhooks).toBe(2);
    expect(storage.capturedRequests).toBe(1);
    expect(storage.oldWebhooks).toBe(0);
    expect(storage.oldRequests).toBe(0);
    expect(storage.oldBytes).toBe(0);
  });
});

describe("listWebhooks", () => {
  it("lists every webhook ordered most-recent-activity-first with full per-row figures", async () => {
    const recent = await seedWebhook({ id: "e3c1b7a4", lastActivityAt: Date.now() - 2 * 60 * 1000 });
    const older = await seedWebhook({ id: "9d40f2c8", lastActivityAt: Date.now() - 6 * 60 * 60 * 1000 });
    await seedRequest(recent, { body: new Uint8Array(500) });
    await seedRequest(older, { body: new Uint8Array(250) });
    await seedRequest(older, { body: new Uint8Array(250) });

    const { items } = await stats.listWebhooks();
    expect(items.map((i) => i.id)).toEqual([recent, older]);
    const recentRow = items[0];
    expect(recentRow).toMatchObject({
      id: recent,
      requestCount: 1,
      payloadBytes: 500,
      expiresAt: recentRow.lastActivityAt + TTL_MS,
    });
    expect(recentRow.createdAt).toBeTypeOf("number");
    expect(recentRow.lastActivityAt).toBeTypeOf("number");
    expect(recentRow.expiresAt).toBeTypeOf("number");
  });

  it("narrows by webhook identifier substring", async () => {
    await seedWebhook({ id: "e3c1b7a4" });
    await seedWebhook({ id: "9d40f2c8" });

    const { items } = await stats.listWebhooks("e3c1");
    expect(items.map((i) => i.id)).toEqual(["e3c1b7a4"]);
  });

  it("narrows by a captured request path substring", async () => {
    const a = await seedWebhook({ id: "e3c1b7a4" });
    const b = await seedWebhook({ id: "9d40f2c8" });
    await seedRequest(a, { path: "/stripe/events" });
    await seedRequest(b, { path: "/health" });

    const { items } = await stats.listWebhooks("stripe");
    expect(items.map((i) => i.id)).toEqual(["e3c1b7a4"]);
  });

  it("returns an empty list when a filter matches nothing", async () => {
    await seedWebhook({ id: "e3c1b7a4" });
    await seedWebhook({ id: "9d40f2c8" });

    expect((await stats.listWebhooks("zzz")).items).toEqual([]);
  });

  it("ignores a blank filter and returns everything", async () => {
    await seedWebhook({ id: "e3c1b7a4" });
    expect((await stats.listWebhooks("   ")).items).toHaveLength(1);
  });
});

describe("webhookExists", () => {
  it("reports whether a webhook id is stored", async () => {
    const id = await seedWebhook();
    expect(await stats.webhookExists(id)).toBe(true);
    expect(await stats.webhookExists("nope")).toBe(false);
  });
});

describe("listWebhookRequests", () => {
  it("returns the total plus the newest requests with method/path/time/size and no body or headers", async () => {
    const w = await seedWebhook();
    for (let i = 0; i < 3; i++) {
      await seedRequest(w, { path: `/req/${i}`, method: "GET", body: new Uint8Array(10 + i) });
    }

    const result = await stats.listWebhookRequests(w, 2);
    expect(result.total).toBe(3);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      method: "GET",
      path: "/req/2",
      bodySize: 12,
    });
    expect(result.items[0].createdAt).toBeTypeOf("number");
    expect(result.items[0].id).toBeTruthy();
    // Never body/headers/query.
    expect("body" in result.items[0]).toBe(false);
    expect("headers" in result.items[0]).toBe(false);
    expect("query" in result.items[0]).toBe(false);
  });

  it("reports a zero body size for an empty-body request", async () => {
    const w = await seedWebhook();
    await seedRequest(w, { body: null });

    const result = await stats.listWebhookRequests(w, 5);
    expect(result.total).toBe(1);
    expect(result.items[0].bodySize).toBe(0);
  });

  it("returns an empty list for a webhook with no captured requests", async () => {
    const w = await seedWebhook();
    expect(await stats.listWebhookRequests(w, 5)).toEqual({ total: 0, items: [] });
  });
});

describe("previewCleanup", () => {
  it("names exactly the over-30-day webhooks and their request counts, nothing else", async () => {
    const oldCutoff = Date.now() - CLEANUP_AGE_DAYS * DAY;
    const old = await seedWebhook({ id: "7b19aa03", createdAt: oldCutoff - 14 * DAY });
    const recent = await seedWebhook({ id: "e3c1b7a4", createdAt: Date.now() - 2 * DAY });
    for (let i = 0; i < 12; i++) await seedRequest(old, { createdAt: oldCutoff - 14 * DAY });
    await seedRequest(recent, {});

    const preview = await stats.previewCleanup();
    expect(preview.webhooks).toEqual([{ id: old, requestCount: 12 }]);
    expect(preview.totalRequests).toBe(12);
  });

  it("returns an empty preview when nothing is old enough", async () => {
    await seedWebhook({ createdAt: Date.now() - 9 * DAY });
    expect(await stats.previewCleanup()).toEqual({ webhooks: [], totalRequests: 0 });
  });
});

describe("runCleanup", () => {
  it("deletes only over-30-day webhooks, cascading their requests, and returns exact counts", async () => {
    const oldCutoff = Date.now() - CLEANUP_AGE_DAYS * DAY;
    const old = await seedWebhook({ createdAt: oldCutoff - 14 * DAY });
    const recent = await seedWebhook({ createdAt: Date.now() - 2 * DAY });
    for (let i = 0; i < 12; i++) await seedRequest(old, { createdAt: oldCutoff - 14 * DAY });
    for (let i = 0; i < 3; i++) await seedRequest(recent, {});

    const result = await stats.runCleanup();
    expect(result).toEqual({ deletedWebhooks: 1, deletedRequests: 12 });

    expect(await stats.webhookExists(old)).toBe(false);
    expect((await stats.listWebhookRequests(old, 5)).total).toBe(0);
    expect(await stats.webhookExists(recent)).toBe(true);
    expect((await stats.listWebhookRequests(recent, 5)).total).toBe(3);
  });

  it("is a no-op returning zero counts when nothing is old enough", async () => {
    await seedWebhook({ createdAt: Date.now() - 9 * DAY });
    await seedRequest(await seedWebhook(), {});

    const result = await stats.runCleanup();
    expect(result).toEqual({ deletedWebhooks: 0, deletedRequests: 0 });
    expect((await stats.getStorage()).webhooks).toBe(2);
  });
});
