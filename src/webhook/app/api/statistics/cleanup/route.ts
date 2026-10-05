import type { NextRequest } from "next/server";
import { previewCleanup, runCleanup } from "@/lib/statistics";
import { getClientIp } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

/**
 * Preview cleanup
 *
 * Reports what an expired-data cleanup pass would remove, without deleting anything. `webhookTtlDays` is the current idle period for new webhooks in days; null means new webhooks never expire, and the preview is then empty.
 */
export async function GET(request: NextRequest) {
  const start = performance.now();
  const ip = getClientIp(request);

  const preview = await previewCleanup();
  const response = Response.json(preview);
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    clientIp: ip,
  });
  return response;
}

/**
 * Run cleanup
 *
 * Permanently deletes webhooks created over 30 days ago and their captured requests, and returns what was removed. Deletes nothing while `WEBHOOK_TTL_DAYS` is 0.
 */
export async function DELETE(request: NextRequest) {
  const start = performance.now();
  const ip = getClientIp(request);

  const result = await runCleanup();
  const response = Response.json(result);
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    clientIp: ip,
  });
  return response;
}
