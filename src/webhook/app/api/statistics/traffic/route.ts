import type { NextRequest } from "next/server";
import { getTraffic, resolveWindow } from "@/lib/statistics";
import { getClientIp } from "@/lib/http";
import { getRequestPath, logRequest } from "@/lib/logging";

export async function GET(request: NextRequest) {
  const start = performance.now();
  const window = resolveWindow(request.nextUrl.searchParams.get("window"));
  const ip = getClientIp(request);

  const stats = await getTraffic(window);
  const response = Response.json(stats);
  logRequest(request.method, getRequestPath(request), response.status, Math.round(performance.now() - start), {
    clientIp: ip,
  });
  return response;
}
