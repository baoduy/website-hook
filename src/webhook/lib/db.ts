import { DAY_MS, MAX_REQUESTS_PER_WEBHOOK, getWebhookTtlDays } from "./constants";
import { ensureSchema, getClient } from "./prisma";

export interface WebhookInfo {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  requestCount: number;
  /** `null` when the webhook never expires. */
  expiresAt: number | null;
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

/** When a webhook idle since `lastActivityAt` expires under its own period; `null` (never) when `ttlDays` is null. */
export function webhookExpiresAt(lastActivityAt: number, ttlDays: number | null): number | null {
  return ttlDays === null ? null : lastActivityAt + ttlDays * DAY_MS;
}

function isExpired(expiresAt: number | null): boolean {
  return expiresAt !== null && Date.now() > expiresAt;
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
  // Written explicitly, null included: an omitted value would take the column default of 7.
  const ttlDays = getWebhookTtlDays();
  await prisma.webhook.create({
    data: { id, createdAt: BigInt(now), lastActivityAt: BigInt(now), creatorIp, ttlDays },
  });

  return { id, createdAt: now, lastActivityAt: now, requestCount: 0, expiresAt: webhookExpiresAt(now, ttlDays) };
}

/** Counts non-expired webhooks created from the same IP for quota enforcement. */
export async function countActiveWebhooksByIp(creatorIp: string): Promise<number> {
  const prisma = getClient();
  await ensureSchema(prisma);

  // Not expired = the negation of isExpired: no period, or now within it.
  const [row] = await prisma.$queryRaw<{ count: bigint }[]>`
    SELECT COUNT(*) AS count
    FROM webhooks
    WHERE creator_ip = ${creatorIp}
      AND (ttl_days IS NULL OR last_activity_at + ttl_days * ${DAY_MS} >= ${BigInt(Date.now())})
  `;
  return Number(row.count);
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
  const expiresAt = webhookExpiresAt(lastActivityAt, row.ttlDays);
  if (isExpired(expiresAt)) return null;

  const requestCount = await prisma.capturedRequest.count({ where: { webhookId: id } });

  return { id: row.id, createdAt: Number(row.createdAt), lastActivityAt, requestCount, expiresAt };
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

  // Each webhook by its own period; never-expiring ones (null) are kept. Cascades to captured requests.
  return prisma.$executeRaw`
    DELETE FROM webhooks
    WHERE ttl_days IS NOT NULL AND last_activity_at + ttl_days * ${DAY_MS} < ${BigInt(Date.now())}
  `;
}
