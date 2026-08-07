import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Database from "better-sqlite3";
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
function seedLastActivityDaysAgo(id: string, days: number) {
  const raw = new Database(dbPath);
  raw.prepare("UPDATE webhooks SET last_activity_at = ? WHERE id = ?").run(Date.now() - days * 24 * 60 * 60 * 1000, id);
  raw.close();
}

describe("createWebhook", () => {
  it("issues a fresh id with an expiry exactly TTL_DAYS out (creation counts as first activity)", () => {
    const webhook = db.createWebhook();
    expect(webhook.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    expect(webhook.requestCount).toBe(0);
    expect(webhook.expiresAt - webhook.createdAt).toBe(TTL_MS);
  });
});

describe("getWebhook", () => {
  it("returns null for an id that was never created", () => {
    expect(db.getWebhook("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("reflects the number of requests captured against it", () => {
    const webhook = db.createWebhook();
    db.insertCapturedRequest(webhook.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    db.insertCapturedRequest(webhook.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    expect(db.getWebhook(webhook.id)?.requestCount).toBe(2);
  });

  it("treats a webhook idle past the TTL as gone, even without the sweep having run (defensive read)", () => {
    const webhook = db.createWebhook();
    seedLastActivityDaysAgo(webhook.id, TTL_DAYS + 1);
    expect(db.getWebhook(webhook.id)).toBeNull();
  });

  it("moves the expiry to 7 days from now once new activity resets the idle clock", () => {
    const webhook = db.createWebhook();
    seedLastActivityDaysAgo(webhook.id, TTL_DAYS - 1); // idle 6 of 7 days — still alive
    db.touchWebhook(webhook.id);

    const refreshed = db.getWebhook(webhook.id);
    expect(refreshed).not.toBeNull();
    expect(refreshed!.expiresAt).toBeGreaterThan(Date.now() + TTL_MS - 5000);
  });
});

describe("deleteWebhook", () => {
  it("removes the webhook and cascades to its captured requests", () => {
    const webhook = db.createWebhook();
    db.insertCapturedRequest(webhook.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });

    db.deleteWebhook(webhook.id);

    expect(db.getWebhook(webhook.id)).toBeNull();
    const raw = new Database(dbPath);
    const remaining = raw.prepare("SELECT COUNT(*) as count FROM captured_requests WHERE webhook_id = ?").get(webhook.id) as { count: number };
    raw.close();
    expect(remaining.count).toBe(0);
  });

  it("is idempotent — deleting an already-gone webhook is a no-op, not an error", () => {
    const webhook = db.createWebhook();
    db.deleteWebhook(webhook.id);
    expect(() => db.deleteWebhook(webhook.id)).not.toThrow();
  });
});

describe("insertCapturedRequest", () => {
  it("enforces the per-webhook cap by pruning the oldest requests first", () => {
    const webhook = db.createWebhook();
    const total = MAX_REQUESTS_PER_WEBHOOK + 5;
    for (let i = 0; i < total; i++) {
      db.insertCapturedRequest(webhook.id, { method: "GET", path: `/${i}`, query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    }

    expect(db.getWebhook(webhook.id)?.requestCount).toBe(MAX_REQUESTS_PER_WEBHOOK);

    const page = db.listCapturedRequests(webhook.id, MAX_REQUESTS_PER_WEBHOOK, null);
    const paths = page.items.map((item) => item.path);
    expect(paths).not.toContain("/0"); // oldest 5 pruned
    expect(paths).not.toContain("/4");
    expect(paths).toContain(`/${total - 1}`); // newest survives
  });
});

describe("listCapturedRequests", () => {
  it("lists newest-first and paginates via cursor", () => {
    const webhook = db.createWebhook();
    for (let i = 0; i < 3; i++) {
      db.insertCapturedRequest(webhook.id, { method: "GET", path: `/${i}`, query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    }

    const firstPage = db.listCapturedRequests(webhook.id, 2, null);
    expect(firstPage.items.map((i) => i.path)).toEqual(["/2", "/1"]);
    expect(firstPage.nextCursor).not.toBeNull();

    const secondPage = db.listCapturedRequests(webhook.id, 2, firstPage.nextCursor);
    expect(secondPage.items.map((i) => i.path)).toEqual(["/0"]);
    expect(secondPage.nextCursor).toBeNull();
  });
});

describe("getCapturedRequest", () => {
  it("retrieves a single captured request in full, and null when it doesn't belong to the webhook", () => {
    const webhook = db.createWebhook();
    const other = db.createWebhook();
    db.insertCapturedRequest(webhook.id, {
      method: "POST",
      path: "/x",
      query: "a=b",
      headers: { "x-foo": "bar" },
      body: Buffer.from("payload"),
      truncated: false,
    });

    const [stored] = db.listCapturedRequests(webhook.id, 1, null).items;
    expect(db.getCapturedRequest(webhook.id, stored.id)).toMatchObject({
      method: "POST",
      path: "/x",
      query: "a=b",
      headers: { "x-foo": "bar" },
      truncated: false,
    });
    expect(db.getCapturedRequest(other.id, stored.id)).toBeNull();
    expect(db.getCapturedRequest(webhook.id, "unknown-id")).toBeNull();
  });
});

describe("purgeExpiredWebhooks", () => {
  it("actually deletes idle webhooks and cascades their captured requests — not just a read-time filter", () => {
    const stale = db.createWebhook();
    const fresh = db.createWebhook();
    db.insertCapturedRequest(stale.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    seedLastActivityDaysAgo(stale.id, TTL_DAYS + 1);

    const purged = db.purgeExpiredWebhooks();

    expect(purged).toBe(1);
    const raw = new Database(dbPath);
    expect(raw.prepare("SELECT 1 FROM webhooks WHERE id = ?").get(stale.id)).toBeUndefined();
    expect(raw.prepare("SELECT COUNT(*) as c FROM captured_requests WHERE webhook_id = ?").get(stale.id)).toEqual({ c: 0 });
    raw.close();
    expect(db.getWebhook(fresh.id)).not.toBeNull();
  });
});

describe("durability across a process restart", () => {
  it("keeps captured data readable when the module (and its DB connection) is reloaded against the same file", async () => {
    const webhook = db.createWebhook();
    db.insertCapturedRequest(webhook.id, {
      method: "POST",
      path: "/restart-check",
      query: "",
      headers: { "x-test": "1" },
      body: Buffer.from("still here"),
      truncated: false,
    });

    // Simulate a process restart: fresh module registry means a brand-new better-sqlite3
    // connection is lazily opened against the same on-disk DB_PATH on next use.
    vi.resetModules();
    const reopened: typeof import("./db") = await import("./db");

    const info = reopened.getWebhook(webhook.id);
    expect(info?.requestCount).toBe(1);

    const [captured] = reopened.listCapturedRequests(webhook.id, 1, null).items;
    expect(captured.path).toBe("/restart-check");
    expect(captured.body.toString()).toBe("still here");
  });
});
