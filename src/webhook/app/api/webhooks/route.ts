import type { NextRequest } from "next/server";
import { CREATE_RATE_LIMIT, getWebhookQuota, isRateLimitDisabled, isWebhookQuotaDisabled } from "@/lib/constants";
import { countActiveWebhooksByIp, createWebhook } from "@/lib/db";
import { getClientIp } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";
import { isRateLimited } from "@/lib/rateLimit";

/**
 * Create a webhook
 *
 * Allocates a new disposable webhook endpoint for the caller's IP and returns its URL, creation time, and expiry. Subject to rate limiting and an optional per-IP quota on active webhooks.
 */
export async function POST(request: NextRequest) {
  const start = performance.now();
  const ip = getClientIp(request);

  if (!isRateLimitDisabled() && isRateLimited(ip, CREATE_RATE_LIMIT.windowMs, CREATE_RATE_LIMIT.max)) {
    const response = Response.json({ error: "rate_limited" }, { status: 429 });
    logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
      clientIp: ip,
    });
    return response;
  }

  if (!isWebhookQuotaDisabled()) {
    const quota = getWebhookQuota();
    if (quota !== null) {
      const count = await countActiveWebhooksByIp(ip);
      if (count >= quota) {
        const response = Response.json({ error: "quota_exceeded" }, { status: 429 });
        logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
          clientIp: ip,
        });
        return response;
      }
    }
  }

  const webhook = await createWebhook(ip);
  // Built from the request's own Host header, not `nextUrl` — which some deployments rewrite
  // to the server's internal hostname rather than what the caller actually connected to.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const url = `${protocol}://${host}/${webhook.id}`;

  const response = Response.json(
    { id: webhook.id, url, createdAt: webhook.createdAt, expiresAt: webhook.expiresAt },
    { status: 201 },
  );
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    webhookId: webhook.id,
    clientIp: ip,
  });
  return response;
}
