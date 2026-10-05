import type { NextRequest } from "next/server";
import { listWebhooks } from "@/lib/statistics";
import { getClientIp, NO_STORE } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

/**
 * List webhooks
 *
 * Returns webhooks for the statistics dashboard, optionally filtered by the `q` search term. `expiresAt` is null when the webhook never expires.
 */
export async function GET(request: NextRequest) {
  const start = performance.now();
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const ip = getClientIp(request);

  const result = await listWebhooks(q);
  const response = Response.json(result, { headers: NO_STORE });
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    clientIp: ip,
  });
  return response;
}
