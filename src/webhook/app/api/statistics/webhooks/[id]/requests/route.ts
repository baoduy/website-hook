import type { NextRequest } from "next/server";
import { listWebhookRequests, webhookExists } from "@/lib/statistics";
import { getClientIp, notFound } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

const DEFAULT_LIMIT = 5;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const start = performance.now();
  const { id } = await params;
  const ip = getClientIp(request);

  const requestedLimit = Number(request.nextUrl.searchParams.get("limit"));
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (!(await webhookExists(id))) {
    const response = notFound();
    logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
      webhookId: id,
      clientIp: ip,
    });
    return response;
  }

  const result = await listWebhookRequests(id, limit);
  const response = Response.json(result);
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    webhookId: id,
    clientIp: ip,
  });
  return response;
}
