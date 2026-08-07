import type { NextRequest } from "next/server";
import type { CapturedRequest, WebhookInfo } from "./db";

export function notFound() {
  return Response.json({ error: "not_found" }, { status: 404 });
}

/**
 * Best-effort caller identity for rate-limiting.
 * Uses the first forwarded IP when available. In Next.js 16 standalone that header is set to the
 * socket remote address, so direct callers are capped per connection. The fallback below is only
 * reachable in tests/edge where no IP header exists; x-test-caller lets tests simulate distinct
 * direct callers without a real remote address.
 */
export function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  if (forwarded) return forwarded;
  // ponytail: no public NextRequest IP API; fallback is a stable test seam, not a per-request UUID.
  return `direct:${request.headers.get("x-test-caller") ?? "default"}`;
}

export function serializeWebhook(webhook: WebhookInfo) {
  return {
    id: webhook.id,
    createdAt: webhook.createdAt,
    lastActivityAt: webhook.lastActivityAt,
    requestCount: webhook.requestCount,
    expiresAt: webhook.expiresAt,
  };
}

/** Body is opaque bytes — base64-encoded for JSON transport, never parsed. */
export function serializeCapturedRequest(row: CapturedRequest) {
  return {
    id: row.id,
    method: row.method,
    path: row.path,
    query: row.query,
    headers: row.headers,
    body: row.body.toString("base64"),
    truncated: row.truncated,
    createdAt: row.createdAt,
  };
}

/**
 * Reads a request body up to `maxBytes`, flagging truncation instead of rejecting (spec R2).
 * Keeps draining past the cap so the connection closes cleanly, but never buffers more than
 * `maxBytes` — bounds memory even for an oversized/malicious body.
 */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<{ body: Buffer; truncated: boolean }> {
  const reader = request.body?.getReader();
  if (!reader) return { body: Buffer.alloc(0), truncated: false };

  const chunks: Uint8Array[] = [];
  let total = 0;
  let truncated = false;

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (truncated) continue;

    total += value.byteLength;
    if (total > maxBytes) {
      truncated = true;
      const keep = maxBytes - (total - value.byteLength);
      if (keep > 0) chunks.push(value.subarray(0, keep));
      continue;
    }
    chunks.push(value);
  }

  return { body: Buffer.concat(chunks), truncated };
}
