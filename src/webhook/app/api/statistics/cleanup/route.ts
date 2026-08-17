import type { NextRequest } from "next/server";
import { previewCleanup, runCleanup } from "@/lib/statistics";
import { getClientIp } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

/**
 * Preview cleanup
 *
 * Reports what an expired-data cleanup pass would remove, without deleting anything.
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
 * Permanently deletes expired webhooks and their captured requests, and returns what was removed.
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
