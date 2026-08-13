import type { NextRequest } from "next/server";
import { previewCleanup, runCleanup } from "@/lib/statistics";
import { getClientIp } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

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
