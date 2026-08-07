import type { NextRequest } from "next/server";
import { CREATE_RATE_LIMIT, isRateLimitDisabled } from "@/lib/constants";
import { createWebhook } from "@/lib/db";
import { getClientIp } from "@/lib/http";
import { isRateLimited } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  if (!isRateLimitDisabled() && isRateLimited(ip, CREATE_RATE_LIMIT.windowMs, CREATE_RATE_LIMIT.max)) {
    return Response.json({ error: "rate_limited" }, { status: 429 });
  }

  const webhook = await createWebhook();
  // Built from the request's own Host header, not `nextUrl` — which some deployments rewrite
  // to the server's internal hostname rather than what the caller actually connected to.
  const host = request.headers.get("host") ?? request.nextUrl.host;
  const protocol = request.headers.get("x-forwarded-proto") ?? request.nextUrl.protocol.replace(":", "");
  const url = `${protocol}://${host}/${webhook.id}`;

  return Response.json(
    { id: webhook.id, url, createdAt: webhook.createdAt, expiresAt: webhook.expiresAt },
    { status: 201 },
  );
}
