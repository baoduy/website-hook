import Database from "better-sqlite3";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MAX_REQUESTS_PER_WEBHOOK, TTL_DAYS } from "./constants";

const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;
const DB_PATH = process.env.DB_PATH ?? "./data/webhook.db";

// Opened lazily on first query, not at import time: `next build` imports every route module to
// collect its config, and initializing here would create/lock the database during the build
// (and race across the build's parallel workers).
let dbInstance: Database.Database | null = null;

function getDb(): Database.Database {
  if (dbInstance) return dbInstance;

  fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  const db = new Database(DB_PATH);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id TEXT PRIMARY KEY,
      created_at INTEGER NOT NULL,
      last_activity_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS captured_requests (
      id TEXT PRIMARY KEY,
      webhook_id TEXT NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      method TEXT NOT NULL,
      path TEXT NOT NULL,
      query TEXT NOT NULL,
      headers TEXT NOT NULL,
      body BLOB,
      truncated INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_captured_requests_webhook ON captured_requests(webhook_id);
  `);

  dbInstance = db;
  return db;
}

export interface WebhookInfo {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  requestCount: number;
  expiresAt: number;
}

export interface CapturedRequestInput {
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  body: Buffer;
  truncated: boolean;
}

export interface CapturedRequest extends CapturedRequestInput {
  id: string;
  webhookId: string;
  createdAt: number;
}

export interface CapturedRequestPage {
  items: CapturedRequest[];
  nextCursor: string | null;
}

function isExpired(lastActivityAt: number): boolean {
  return Date.now() - lastActivityAt > TTL_MS;
}

export function createWebhook(): WebhookInfo {
  const id = crypto.randomUUID();
  const now = Date.now();
  getDb().prepare("INSERT INTO webhooks (id, created_at, last_activity_at) VALUES (?, ?, ?)").run(id, now, now);
  return { id, createdAt: now, lastActivityAt: now, requestCount: 0, expiresAt: now + TTL_MS };
}

export function touchWebhook(id: string): void {
  getDb().prepare("UPDATE webhooks SET last_activity_at = ? WHERE id = ?").run(Date.now(), id);
}

/** Null if the webhook doesn't exist or is past its idle TTL — belt-and-suspenders check alongside the hourly sweep. */
export function getWebhook(id: string): WebhookInfo | null {
  const db = getDb();
  const row = db
    .prepare("SELECT id, created_at as createdAt, last_activity_at as lastActivityAt FROM webhooks WHERE id = ?")
    .get(id) as { id: string; createdAt: number; lastActivityAt: number } | undefined;
  if (!row || isExpired(row.lastActivityAt)) return null;

  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM captured_requests WHERE webhook_id = ?")
    .get(id) as { count: number };

  return { ...row, requestCount: count, expiresAt: row.lastActivityAt + TTL_MS };
}

/** Idempotent — deleting an already-gone webhook is a no-op, not an error. Cascades to its captured requests. */
export function deleteWebhook(id: string): void {
  getDb().prepare("DELETE FROM webhooks WHERE id = ?").run(id);
}

/** Inserts a captured request, then prunes the oldest rows past MAX_REQUESTS_PER_WEBHOOK. */
export function insertCapturedRequest(webhookId: string, input: CapturedRequestInput): void {
  const db = getDb();
  const id = crypto.randomUUID();
  db.prepare(
    `INSERT INTO captured_requests (id, webhook_id, created_at, method, path, query, headers, body, truncated)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, webhookId, Date.now(), input.method, input.path, input.query, JSON.stringify(input.headers), input.body, input.truncated ? 1 : 0);

  const { count } = db
    .prepare("SELECT COUNT(*) as count FROM captured_requests WHERE webhook_id = ?")
    .get(webhookId) as { count: number };

  const overflow = count - MAX_REQUESTS_PER_WEBHOOK;
  if (overflow > 0) {
    db.prepare(
      `DELETE FROM captured_requests WHERE rowid IN (
         SELECT rowid FROM captured_requests WHERE webhook_id = ? ORDER BY rowid ASC LIMIT ?
       )`,
    ).run(webhookId, overflow);
  }
}

interface RawCapturedRequestRow {
  seq: number;
  id: string;
  webhookId: string;
  createdAt: number;
  method: string;
  path: string;
  query: string;
  headers: string;
  body: Buffer | null;
  truncated: number;
}

const SELECT_CAPTURED_REQUEST = `
  SELECT rowid as seq, id, webhook_id as webhookId, created_at as createdAt,
         method, path, query, headers, body, truncated
  FROM captured_requests
`;

function toCapturedRequest(row: RawCapturedRequestRow): CapturedRequest {
  return {
    id: row.id,
    webhookId: row.webhookId,
    createdAt: row.createdAt,
    method: row.method,
    path: row.path,
    query: row.query,
    headers: JSON.parse(row.headers),
    body: row.body ?? Buffer.alloc(0),
    truncated: row.truncated === 1,
  };
}

/** Newest-first, cursor-paginated. `cursor` is the opaque `nextCursor` from a previous page. */
export function listCapturedRequests(webhookId: string, limit: number, cursor: string | null): CapturedRequestPage {
  const db = getDb();
  const cursorSeq = cursor ? Number(cursor) : null;
  const rows = (
    cursorSeq !== null
      ? db
          .prepare(`${SELECT_CAPTURED_REQUEST} WHERE webhook_id = ? AND rowid < ? ORDER BY rowid DESC LIMIT ?`)
          .all(webhookId, cursorSeq, limit + 1)
      : db.prepare(`${SELECT_CAPTURED_REQUEST} WHERE webhook_id = ? ORDER BY rowid DESC LIMIT ?`).all(webhookId, limit + 1)
  ) as RawCapturedRequestRow[];

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);
  return {
    items: page.map(toCapturedRequest),
    nextCursor: hasMore ? String(page[page.length - 1].seq) : null,
  };
}

export function getCapturedRequest(webhookId: string, requestId: string): CapturedRequest | null {
  const row = getDb()
    .prepare(`${SELECT_CAPTURED_REQUEST} WHERE webhook_id = ? AND id = ?`)
    .get(webhookId, requestId) as RawCapturedRequestRow | undefined;
  return row ? toCapturedRequest(row) : null;
}

/** Hourly sweep entry point (see instrumentation.ts) — the actual TTL enforcement, independent of reads. */
export function purgeExpiredWebhooks(): number {
  const cutoff = Date.now() - TTL_MS;
  return getDb().prepare("DELETE FROM webhooks WHERE last_activity_at < ?").run(cutoff).changes;
}
