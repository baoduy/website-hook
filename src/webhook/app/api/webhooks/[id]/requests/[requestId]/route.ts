import type { NextRequest } from "next/server";
import { getCapturedRequest, getWebhook } from "@/lib/db";
import { getClientIp, notFound, serializeCapturedRequest } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; requestId: string }> },
) {
  const start = performance.now();
  const { id, requestId } = await params;
  const ip = getClientIp(request as NextRequest);
  if (!(await getWebhook(id))) {
    const response = notFound();
    logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
      webhookId: id,
      clientIp: ip,
    });
    return response;
  }

  const captured = await getCapturedRequest(id, requestId);
  if (!captured) {
    const response = notFound();
    logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
      webhookId: id,
      clientIp: ip,
    });
    return response;
  }

  const response = Response.json(serializeCapturedRequest(captured));
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    webhookId: id,
    clientIp: ip,
  });
  return response;
}
