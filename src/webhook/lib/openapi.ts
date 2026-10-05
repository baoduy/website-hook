import type { NextRequest } from "next/server";
import { requestOrigin } from "./http";

export function withRequestServerUrl<T extends { servers?: Array<{ url: string }> }>(
  document: T,
  request: NextRequest,
): T {
  const origin = requestOrigin(request);
  const servers = document.servers?.length
    ? document.servers.map((server, index) => (index === 0 ? { ...server, url: origin } : server))
    : [{ url: origin }];

  return { ...document, servers };
}
