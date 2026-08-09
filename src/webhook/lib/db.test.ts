import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_REQUESTS_PER_WEBHOOK, TTL_DAYS } from "./constants";

const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

let dir: string;
let dbPath: string;
let db: typeof import("./db");

beforeEach(async () => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-db-"));
  dbPath = path.join(dir, "webhook.db");
  process.env.DB_PATH = dbPath;
  db = await import("./db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

/** Directly rewrites last_activity_at, bypassing lib/db — simulates activity N days ago. */
async function seedLastActivityDaysAgo(id: string, days: number) {
  const { ensureSchema, getClient } = await import("./prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  await prisma.webhook.update({
    where: { id },
    data: { lastActivityAt: BigInt(Date.now() - days * 24 * 60 * 60 * 1000) },
  });
}

describe("createWebhook", () => {
  it("issues a fresh id with an expiry exactly TTL_DAYS out (creation counts as first activity)", async () => {
    const webhook = await db.createWebhook();
    expect(webhook.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(webhook.requestCount).toBe(0);
    expect(webhook.expiresAt - webhook.createdAt).toBe(TTL_MS);
  });

  it("persists the creator IP so the quota survives process restarts and shared stores", async () => {
    const webhook = await db.createWebhook("203.0.113.7");

    const { ensureSchema, getClient } = await import("./prisma");
    const prisma = getClient();
    await ensureSchema(prisma);
    const row = await prisma.webhook.findUnique({ where: { id: webhook.id } });
    expect(row?.creatorIp).toBe("203.0.113.7");
  });
});

describe("countActiveWebhooksByIp", () => {
  it("counts only webhooks created from the same IP (quota is per-IP, not global)", async () => {
    await db.createWebhook("203.0.113.7");
    await db.createWebhook("203.0.113.7");
    await db.createWebhook("198.51.100.22");

    expect(await db.countActiveWebhooksByIp("203.0.113.7")).toBe(2);
    expect(await db.countActiveWebhooksByIp("198.51.100.22")).toBe(1);
    expect(await db.countActiveWebhooksByIp("192.0.2.9")).toBe(0);
  });

  it("excludes expired-but-not-yet-purged webhooks from the count (spec R2)", async () => {
    await db.createWebhook("203.0.113.7");
    const expired = await db.createWebhook("203.0.113.7");
    await seedLastActivityDaysAgo(expired.id, TTL_DAYS + 1);

    // The expired row is still in the table (the hourly sweep has not run), but it must not
    // count against the caller's quota — the quota is derived from non-expired rows only.
    expect(await db.countActiveWebhooksByIp("203.0.113.7")).toBe(1);
  });

  it("treats an empty creator IP as its own bucket (legacy callers default to empty, not unset)", async () => {
    await db.createWebhook();
    await db.createWebhook("");

    expect(await db.countActiveWebhooksByIp("")).toBe(2);
    expect(await db.countActiveWebhooksByIp("203.0.113.7")).toBe(0);
  });

  it("reflects deletion immediately — deleting a webhook frees its quota slot", async () => {
    const a = await db.createWebhook("203.0.113.7");
    await db.createWebhook("203.0.113.7");

    expect(await db.countActiveWebhooksByIp("203.0.113.7")).toBe(2);
    await db.deleteWebhook(a.id);
    expect(await db.countActiveWebhooksByIp("203.0.113.7")).toBe(1);
  });
});

describe("getWebhook", () => {
  it("returns null for an id that was never created", async () => {
    expect(await db.getWebhook("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("reflects the number of requests captured against it", async () => {
    const webhook = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    await db.insertCapturedRequest(webhook.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    expect((await db.getWebhook(webhook.id))?.requestCount).toBe(2);
  });

  it("treats a webhook idle past the TTL as gone, even without the sweep having run (defensive read)", async () => {
    const webhook = await db.createWebhook();
    await seedLastActivityDaysAgo(webhook.id, TTL_DAYS + 1);
    expect(await db.getWebhook(webhook.id)).toBeNull();
  });

  it("moves the expiry to 7 days from now once new activity resets the idle clock", async () => {
    const webhook = await db.createWebhook();
    await seedLastActivityDaysAgo(webhook.id, TTL_DAYS - 1); // idle 6 of 7 days — still alive
    await db.touchWebhook(webhook.id);

    const refreshed = await db.getWebhook(webhook.id);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.expiresAt).toBeGreaterThan(Date.now() + TTL_MS - 5000);
  });
});

describe("deleteWebhook", () => {
  it("removes the webhook and cascades to its captured requests", async () => {
    const webhook = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });

    await db.deleteWebhook(webhook.id);

    expect(await db.getWebhook(webhook.id)).toBeNull();
    const { ensureSchema, getClient } = await import("./prisma");
    const prisma = getClient();
    await ensureSchema(prisma);
    const remaining = (await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      "SELECT COUNT(*) as count FROM captured_requests WHERE webhook_id = ?",
      webhook.id,
    )) as unknown as { count: bigint }[];
    expect(Number(remaining[0].count)).toBe(0);
  });

  it("is idempotent — deleting an already-gone webhook is a no-op, not an error", async () => {
    const webhook = await db.createWebhook();
    await db.deleteWebhook(webhook.id);
    await expect(db.deleteWebhook(webhook.id)).resolves.not.toThrow();
  });
});

describe("insertCapturedRequest", () => {
  it("enforces the per-webhook cap by pruning the oldest requests first", async () => {
    const webhook = await db.createWebhook();
    const total = MAX_REQUESTS_PER_WEBHOOK + 5;
    for (let i = 0; i < total; i++) {
      await db.insertCapturedRequest(webhook.id, { method: "GET", path: `/${i}`, query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    }

    expect((await db.getWebhook(webhook.id))?.requestCount).toBe(MAX_REQUESTS_PER_WEBHOOK);

    const page = await db.listCapturedRequests(webhook.id, MAX_REQUESTS_PER_WEBHOOK, null);
    const paths = page.items.map((item) => item.path);
    expect(paths).not.toContain("/0"); // oldest 5 pruned
    expect(paths).not.toContain("/4");
    expect(paths).toContain(`/${total - 1}`); // newest survives
  });
});

describe("listCapturedRequests", () => {
  it("lists newest-first and paginates via cursor", async () => {
    const webhook = await db.createWebhook();
    for (let i = 0; i < 3; i++) {
      await db.insertCapturedRequest(webhook.id, { method: "GET", path: `/${i}`, query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    }

    const firstPage = await db.listCapturedRequests(webhook.id, 2, null);
    expect(firstPage.items.map((i) => i.path)).toEqual(["/2", "/1"]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = await db.listCapturedRequests(webhook.id, 2, firstPage.nextCursor);
    expect(secondPage.items.map((i) => i.path)).toEqual(["/0"]);
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe("getCapturedRequest", () => {
  it("retrieves a single captured request in full, and null when it doesn't belong to the webhook", async () => {
    const webhook = await db.createWebhook();
    const other = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, {
      method: "POST",
      path: "/x",
      query: "a=b",
      headers: { "x-foo": "bar" },
      body: Buffer.from("payload"),
      truncated: false,
    });

    const [stored] = (await db.listCapturedRequests(webhook.id, 1, null)).items;
    expect(await db.getCapturedRequest(webhook.id, stored.id)).toMatchObject({
      method: "POST",
      path: "/x",
      query: "a=b",
      headers: { "x-foo": "bar" },
      truncated: false,
    });
    expect(await db.getCapturedRequest(other.id, stored.id)).toBeNull();
    expect(await db.getCapturedRequest(webhook.id, "unknown-id")).toBeNull();
  });
});

describe("purgeExpiredWebhooks", () => {
  it("actually deletes idle webhooks and cascades their captured requests — not just a read-time filter", async () => {
    const stale = await db.createWebhook();
    const fresh = await db.createWebhook();
    await db.insertCapturedRequest(stale.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    await seedLastActivityDaysAgo(stale.id, TTL_DAYS + 1);

    const purged = await db.purgeExpiredWebhooks();

    expect(purged).toBe(1);
    const { ensureSchema, getClient } = await import("./prisma");
    const prisma = getClient();
    await ensureSchema(prisma);
    const staleRow = (await prisma.$queryRawUnsafe<{ n: number }[]>(
      "SELECT 1 as n FROM webhooks WHERE id = ?",
      stale.id,
    )) as unknown as { n: number }[];
    expect(staleRow.length).toBe(0);
    const remaining = (await prisma.$queryRawUnsafe<{ c: bigint }[]>(
      "SELECT COUNT(*) as c FROM captured_requests WHERE webhook_id = ?",
      stale.id,
    )) as unknown as { c: bigint }[];
    expect(Number(remaining[0].c)).toBe(0);
    expect(await db.getWebhook(fresh.id)).not.toBeNull();
  });
});

describe("durability across a process restart", () => {
  it("keeps captured data readable when the module (and its DB connection) is reloaded against the same file", async () => {
    const webhook = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, {
      method: "POST",
      path: "/restart-check",
      query: "",
      headers: { "x-test": "1" },
      body: Buffer.from("still here"),
      truncated: false,
    });

    // Simulate a process restart: fresh module registry means a brand-new Prisma
    // client is lazily opened against the same on-disk DB_PATH on next use.
    vi.resetModules();
    const reopened: typeof import("./db") = await import("./db");

    const info = await reopened.getWebhook(webhook.id);
    expect(info?.requestCount).toBe(1);

    const [captured] = (await reopened.listCapturedRequests(webhook.id, 1, null)).items;
    expect(captured.path).toBe("/restart-check");
    expect(captured.body.toString()).toBe("still here");
  });
});
