import { Prisma } from "@prisma/client";
import { CLEANUP_AGE_DAYS, TTL_DAYS, TRAFFIC_WINDOWS, type TrafficWindow } from "./constants";

export type { TrafficWindow };
import { ensureSchema, getClient } from "./prisma";

const CLEANUP_AGE_MS = CLEANUP_AGE_DAYS * 24 * 60 * 60 * 1000;
const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

export type TrafficBucket = { start: number; count: number };

export type TrafficMethod = { method: string; count: number; percentage: number };

export type Traffic = {
  window: TrafficWindow;
  bucketSize: string;
  buckets: TrafficBucket[];
  totalRequests: number;
  busiestBucket: number;
  averagePerDay: number;
  activeWebhooks: number;
  totalWebhooks: number;
  payloadBytes: number;
  averageBodyBytes: number;
  largestBodyBytes: number;
  emptyBodies: number;
  truncatedBodies: number;
  methods: TrafficMethod[];
};

export type Storage = {
  webhooks: number;
  capturedRequests: number;
  oldWebhooks: number;
  oldRequests: number;
  oldBytes: number;
};

export type WebhookListItem = {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  requestCount: number;
  payloadBytes: number;
  expiresAt: number;
};

export type WebhookList = { items: WebhookListItem[] };

export type RecentRequestItem = {
  id: string;
  method: string;
  path: string;
  createdAt: number;
  bodySize: number;
};

export type RecentRequests = { total: number; items: RecentRequestItem[] };

export type CleanupPreviewItem = { id: string; requestCount: number };

export type CleanupPreview = { webhooks: CleanupPreviewItem[]; totalRequests: number };

export type CleanupResult = { deletedWebhooks: number; deletedRequests: number };

function nowMs(): number {
  return Date.now();
}

function toNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return Number(value);
}

export function resolveWindow(raw: string | null): TrafficWindow {
  const key = raw as TrafficWindow;
  return TRAFFIC_WINDOWS[key] ? key : "24h";
}

export async function getTraffic(window: TrafficWindow): Promise<Traffic> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const cfg = TRAFFIC_WINDOWS[window];
  const end = Math.ceil(nowMs() / cfg.bucketMs) * cfg.bucketMs;
  const start = end - cfg.ms;
  const bucketCount = Math.round(cfg.ms / cfg.bucketMs);

  // Aggregate over the window: one row per bucket with method totals and body stats.
  // SQLite LENGTH(body) returns the byte length of the BLOB; null body yields null.
  type RawBucketRow = {
    bucket_index: bigint;
    method: string;
    count: bigint;
    bodyBytes: bigint | null;
    emptyBodies: bigint;
    truncatedBodies: bigint;
    largestBody: bigint | null;
  };

  const rows = await prisma.$queryRaw<RawBucketRow[]>`
    SELECT
      CAST((created_at - ${BigInt(start)}) / ${BigInt(cfg.bucketMs)} AS INTEGER) AS bucket_index,
      method,
      COUNT(*) AS count,
      SUM(LENGTH(body)) AS bodyBytes,
      SUM(CASE WHEN body IS NULL OR LENGTH(body) = 0 THEN 1 ELSE 0 END) AS emptyBodies,
      SUM(CASE WHEN truncated = 1 THEN 1 ELSE 0 END) AS truncatedBodies,
      MAX(LENGTH(body)) AS largestBody
    FROM captured_requests
    WHERE created_at >= ${BigInt(start)} AND created_at <= ${BigInt(end)}
    GROUP BY bucket_index, method
    ORDER BY bucket_index ASC
  `;

  const buckets: TrafficBucket[] = Array.from({ length: bucketCount }, (_, i) => ({
    start: start + i * cfg.bucketMs,
    count: 0,
  }));

  const methodCounts: Record<string, number> = {};
  let totalRequests = 0;
  let payloadBytes = 0;
  let emptyBodies = 0;
  let truncatedBodies = 0;
  let largestBodyBytes = 0;

  rows.forEach((row) => {
    const idx = Math.min(bucketCount - 1, Math.max(0, Number(row.bucket_index)));
    const count = Number(row.count);
    buckets[idx].count += count;
    totalRequests += count;

    methodCounts[row.method] = (methodCounts[row.method] || 0) + count;
    payloadBytes += toNumber(row.bodyBytes);
    emptyBodies += Number(row.emptyBodies);
    truncatedBodies += Number(row.truncatedBodies);
    largestBodyBytes = Math.max(largestBodyBytes, toNumber(row.largestBody));
  });

  const busiestBucket = buckets.reduce((max, b) => Math.max(max, b.count), 0);

  const methods: TrafficMethod[] = Object.entries(methodCounts)
    .sort(([, a], [, b]) => b - a)
    .map(([method, count]) => ({
      method,
      count,
      percentage: totalRequests > 0 ? Math.round((count * 100) / totalRequests) : 0,
    }));

  const [activeRows, totalWebhooks] = await Promise.all([
    prisma.$queryRaw<{ webhookId: string }[]>`
      SELECT DISTINCT webhook_id AS webhookId
      FROM captured_requests
      WHERE created_at >= ${BigInt(start)} AND created_at <= ${BigInt(end)}
    `,
    prisma.webhook.count(),
  ]);

  return {
    window,
    bucketSize: bucketLabel(window),
    buckets,
    totalRequests,
    busiestBucket,
    averagePerDay: totalRequests > 0 ? Math.round(totalRequests / (cfg.ms / 86_400_000)) : 0,
    activeWebhooks: activeRows.length,
    totalWebhooks,
    payloadBytes,
    averageBodyBytes: totalRequests > 0 ? Math.round(payloadBytes / totalRequests) : 0,
    largestBodyBytes,
    emptyBodies,
    truncatedBodies,
    methods,
  };
}

export async function getStorage(): Promise<Storage> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const cutoff = BigInt(nowMs() - CLEANUP_AGE_MS);

  type RawStorageRow = {
    webhooks: bigint;
    capturedRequests: bigint;
    oldWebhooks: bigint;
    oldRequests: bigint;
    oldBytes: bigint | null;
  };

  const [summary] = await prisma.$queryRaw<RawStorageRow[]>`
    SELECT
      (SELECT COUNT(*) FROM webhooks) AS webhooks,
      (SELECT COUNT(*) FROM captured_requests) AS capturedRequests,
      (SELECT COUNT(*) FROM webhooks WHERE created_at < ${cutoff}) AS oldWebhooks,
      (SELECT COUNT(*) FROM captured_requests WHERE webhook_id IN (
        SELECT id FROM webhooks WHERE created_at < ${cutoff}
      )) AS oldRequests,
      (SELECT COALESCE(SUM(LENGTH(body)), 0) FROM captured_requests WHERE webhook_id IN (
        SELECT id FROM webhooks WHERE created_at < ${cutoff}
      )) AS oldBytes
  `;

  return {
    webhooks: Number(summary.webhooks),
    capturedRequests: Number(summary.capturedRequests),
    oldWebhooks: Number(summary.oldWebhooks),
    oldRequests: Number(summary.oldRequests),
    oldBytes: toNumber(summary.oldBytes),
  };
}

export async function listWebhooks(filter?: string): Promise<WebhookList> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const q = filter?.trim().toLowerCase();

  // Find matching webhook ids by id or request path, then aggregate stats for those ids.
  let ids: string[] | undefined;
  if (q) {
    const matched = await prisma.$queryRaw<{ id: string }[]>`
      SELECT DISTINCT w.id
      FROM webhooks w
      LEFT JOIN captured_requests r ON r.webhook_id = w.id
      WHERE LOWER(w.id) LIKE ${`%${q}%`} OR LOWER(r.path) LIKE ${`%${q}%`}
    `;
    ids = matched.map((r) => r.id);
    if (ids.length === 0) return { items: [] };
  }

  type RawWebhookRow = {
    id: string;
    createdAt: bigint;
    lastActivityAt: bigint;
    requestCount: bigint;
    payloadBytes: bigint | null;
  };

  // Build a safe parameterized IN clause via Prisma.join.
  const whereIn = ids && ids.length > 0 ? Prisma.sql`WHERE w.id IN (${Prisma.join(ids)})` : Prisma.sql``;

  const rows = await prisma.$queryRaw<RawWebhookRow[]>`
    SELECT
      w.id,
      w.created_at AS createdAt,
      w.last_activity_at AS lastActivityAt,
      COUNT(r.id) AS requestCount,
      COALESCE(SUM(LENGTH(r.body)), 0) AS payloadBytes
    FROM webhooks w
    LEFT JOIN captured_requests r ON r.webhook_id = w.id
    ${whereIn}
    GROUP BY w.id
    ORDER BY w.last_activity_at DESC
  `;

  return {
    items: rows.map((row) => ({
      id: row.id,
      createdAt: Number(row.createdAt),
      lastActivityAt: Number(row.lastActivityAt),
      requestCount: Number(row.requestCount),
      payloadBytes: toNumber(row.payloadBytes),
      expiresAt: Number(row.lastActivityAt) + TTL_MS,
    })),
  };
}

export async function webhookExists(webhookId: string): Promise<boolean> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const row = await prisma.webhook.findUnique({ where: { id: webhookId }, select: { id: true } });
  return row !== null;
}

export async function listWebhookRequests(webhookId: string, limit: number): Promise<RecentRequests> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const [total, rows] = await Promise.all([
    prisma.capturedRequest.count({ where: { webhookId } }),
    prisma.capturedRequest.findMany({
      where: { webhookId },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit,
      select: { id: true, method: true, path: true, createdAt: true, body: true },
    }),
  ]);

  return {
    total,
    items: rows.map((row) => ({
      id: row.id,
      method: row.method,
      path: row.path,
      createdAt: Number(row.createdAt),
      bodySize: row.body ? row.body.byteLength : 0,
    })),
  };
}

export async function previewCleanup(): Promise<CleanupPreview> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const cutoff = BigInt(nowMs() - CLEANUP_AGE_MS);

  const rows = await prisma.$queryRaw<CleanupPreviewItem[]>`
    SELECT
      w.id,
      COUNT(r.id) AS requestCount
    FROM webhooks w
    LEFT JOIN captured_requests r ON r.webhook_id = w.id
    WHERE w.created_at < ${cutoff}
    GROUP BY w.id
    ORDER BY w.created_at ASC
  `;

  const totalRequests = rows.reduce((sum, r) => sum + Number(r.requestCount), 0);
  return { webhooks: rows.map((r) => ({ id: r.id, requestCount: Number(r.requestCount) })), totalRequests };
}

export async function runCleanup(): Promise<CleanupResult> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const cutoff = BigInt(nowMs() - CLEANUP_AGE_MS);

  // Cascade delete removes requests first.
  const deletedRequestsResult = await prisma.$executeRaw`
    DELETE FROM captured_requests
    WHERE webhook_id IN (SELECT id FROM webhooks WHERE created_at < ${cutoff})
  `;

  const deletedWebhooksResult = await prisma.$executeRaw`
    DELETE FROM webhooks WHERE created_at < ${cutoff}
  `;

  return {
    deletedWebhooks: Number(deletedWebhooksResult),
    deletedRequests: Number(deletedRequestsResult),
  };
}

function bucketLabel(window: TrafficWindow): string {
  switch (window) {
    case "24h":
      return "1h";
    case "3d":
      return "3h";
    case "7d":
      return "6h";
    case "30d":
      return "1d";
  }
}
