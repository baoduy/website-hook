import type { NextRequest } from "next/server";
import { getWebhook, listCapturedRequests } from "@/lib/db";
import { getClientIp, notFound, serializeCapturedRequest } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const start = performance.now();
  const { id } = await params;
  const ip = getClientIp(request);
  if (!(await getWebhook(id))) {
    const response = notFound();
    logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
      webhookId: id,
      clientIp: ip,
    });
    return response;
  }

  const { searchParams } = request.nextUrl;
  const requestedLimit = Number(searchParams.get("limit"));
  const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, MAX_LIMIT) : DEFAULT_LIMIT;
  const cursor = searchParams.get("cursor");

  const page = await listCapturedRequests(id, limit, cursor);
  const response = Response.json({ items: page.items.map(serializeCapturedRequest), nextCursor: page.nextCursor });
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    webhookId: id,
    clientIp: ip,
  });
  return response;
}
