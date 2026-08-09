import { MAX_REQUESTS_PER_WEBHOOK, TTL_DAYS } from "./constants";
import { ensureSchema, getClient } from "./prisma";

const TTL_MS = TTL_DAYS * 24 * 60 * 60 * 1000;

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

function toCapturedRequest(row: {
  id: string;
  webhookId: string;
  createdAt: bigint;
  method: string;
  path: string;
  query: string;
  headers: string;
  body: Uint8Array | null;
  truncated: boolean;
}): CapturedRequest {
  return {
    id: row.id,
    webhookId: row.webhookId,
    createdAt: Number(row.createdAt),
    method: row.method,
    path: row.path,
    query: row.query,
    headers: JSON.parse(row.headers),
    body: row.body ? Buffer.from(row.body) : Buffer.alloc(0),
    truncated: row.truncated,
  };
}

interface Cursor {
  createdAt: number;
  id: string;
}

function encodeCursor(cursor: Cursor): string {
  return Buffer.from(JSON.stringify(cursor)).toString("base64url");
}

function decodeCursor(cursor: string): Cursor {
  return JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8")) as Cursor;
}

export async function createWebhook(creatorIp: string = ""): Promise<WebhookInfo> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const id = crypto.randomUUID();
  const now = Date.now();
  await prisma.webhook.create({
    data: { id, createdAt: BigInt(now), lastActivityAt: BigInt(now), creatorIp },
  });

  return { id, createdAt: now, lastActivityAt: now, requestCount: 0, expiresAt: now + TTL_MS };
}

/** Counts non-expired webhooks created from the same IP for quota enforcement. */
export async function countActiveWebhooksByIp(creatorIp: string): Promise<number> {
  const prisma = getClient();
  await ensureSchema(prisma);

  return prisma.webhook.count({
    where: {
      creatorIp,
      lastActivityAt: { gt: BigInt(Date.now() - TTL_MS) },
    },
  });
}

export async function touchWebhook(id: string): Promise<void> {
  const prisma = getClient();
  await ensureSchema(prisma);

  await prisma.webhook.updateMany({
    where: { id },
    data: { lastActivityAt: BigInt(Date.now()) },
  });
}

/** Null if the webhook doesn't exist or is past its idle TTL — belt-and-suspenders check alongside the hourly sweep. */
export async function getWebhook(id: string): Promise<WebhookInfo | null> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const row = await prisma.webhook.findUnique({ where: { id } });
  if (!row) return null;

  const lastActivityAt = Number(row.lastActivityAt);
  if (isExpired(lastActivityAt)) return null;

  const requestCount = await prisma.capturedRequest.count({ where: { webhookId: id } });

  return { id: row.id, createdAt: Number(row.createdAt), lastActivityAt, requestCount, expiresAt: lastActivityAt + TTL_MS };
}

/** Idempotent — deleting an already-gone webhook is a no-op, not an error. Cascades to its captured requests. */
export async function deleteWebhook(id: string): Promise<void> {
  const prisma = getClient();
  await ensureSchema(prisma);

  await prisma.webhook.deleteMany({ where: { id } });
}

/** Inserts a captured request, then prunes the oldest rows past MAX_REQUESTS_PER_WEBHOOK. */
export async function insertCapturedRequest(webhookId: string, input: CapturedRequestInput): Promise<void> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const id = crypto.randomUUID();
  await prisma.capturedRequest.create({
    data: {
      id,
      webhookId,
      createdAt: BigInt(Date.now()),
      method: input.method,
      path: input.path,
      query: input.query,
      headers: JSON.stringify(input.headers),
      body: input.body as unknown as Uint8Array<ArrayBuffer>,
      truncated: input.truncated,
    },
  });

  const count = await prisma.capturedRequest.count({ where: { webhookId } });
  const overflow = count - MAX_REQUESTS_PER_WEBHOOK;

  if (overflow > 0) {
    const oldest = await prisma.capturedRequest.findMany({
      where: { webhookId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: overflow,
      select: { id: true },
    });

    await prisma.capturedRequest.deleteMany({
      where: { id: { in: oldest.map((row) => row.id) } },
    });
  }
}

/** Newest-first, cursor-paginated. `cursor` is the opaque `nextCursor` from a previous page. */
export async function listCapturedRequests(
  webhookId: string,
  limit: number,
  cursor: string | null,
): Promise<CapturedRequestPage> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const decodedCursor = cursor ? decodeCursor(cursor) : null;
  const take = limit + 1;

  const rows = await prisma.capturedRequest.findMany({
    where: {
      webhookId,
      ...(decodedCursor && {
        OR: [
          { createdAt: { lt: BigInt(decodedCursor.createdAt) } },
          { createdAt: BigInt(decodedCursor.createdAt), id: { lt: decodedCursor.id } },
        ],
      }),
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take,
  });

  const hasMore = rows.length > limit;
  const page = rows.slice(0, limit);

  return {
    items: page.map(toCapturedRequest),
    nextCursor: hasMore && page.length > 0 ? encodeCursor({ createdAt: Number(page[page.length - 1].createdAt), id: page[page.length - 1].id }) : null,
  };
}

export async function getCapturedRequest(webhookId: string, requestId: string): Promise<CapturedRequest | null> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const row = await prisma.capturedRequest.findFirst({
    where: { id: requestId, webhookId },
  });

  return row ? toCapturedRequest(row) : null;
}

/** Hourly sweep entry point (see instrumentation.ts) — the actual TTL enforcement, independent of reads. */
export async function purgeExpiredWebhooks(): Promise<number> {
  const prisma = getClient();
  await ensureSchema(prisma);

  const cutoff = BigInt(Date.now() - TTL_MS);
  const result = await prisma.webhook.deleteMany({
    where: { lastActivityAt: { lt: cutoff } },
  });

  return result.count;
}
