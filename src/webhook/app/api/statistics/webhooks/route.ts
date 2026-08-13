import type { NextRequest } from "next/server";
import { listWebhooks } from "@/lib/statistics";
import { getClientIp } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const q = request.nextUrl.searchParams.get("q") ?? undefined;
  const ip = getClientIp(request);

  const result = await listWebhooks(q);
  const response = Response.json(result);
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    clientIp: ip,
  });
  return response;
}
