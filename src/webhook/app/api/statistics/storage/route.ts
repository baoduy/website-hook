import type { NextRequest } from "next/server";
import { getStorage } from "@/lib/statistics";
import { getClientIp } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const ip = getClientIp(request);

  const stats = await getStorage();
  const response = Response.json(stats);
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    clientIp: ip,
  });
  return response;
}
