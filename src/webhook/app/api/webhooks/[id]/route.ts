import type { NextRequest } from "next/server";
import { deleteWebhook, getWebhook } from "@/lib/db";
import { getClientIp, notFound, serializeWebhook } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const start = performance.now();
  const { id } = await params;
  const ip = getClientIp(request as NextRequest);
  const webhook = await getWebhook(id);
  if (!webhook) {
    const response = notFound();
    logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
      webhookId: id,
      clientIp: ip,
    });
    return response;
  }

  const response = Response.json(serializeWebhook(webhook));
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    webhookId: id,
    clientIp: ip,
  });
  return response;
}

// Idempotent: deleting an already-gone webhook still returns 204 (spec R3).
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const start = performance.now();
  const { id } = await params;
  const ip = getClientIp(request as NextRequest);
  await deleteWebhook(id);
  const response = new Response(null, { status: 204 });
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    webhookId: id,
    clientIp: ip,
  });
  return response;
}
