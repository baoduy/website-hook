export interface LogMeta {
  webhookId?: string;
  clientIp?: string;
}

/** Best-effort path extraction that works for both NextRequest and plain Request. */
export function getRequestPath(request: { url: string }): string {
  try {
    return new URL(request.url).pathname;
  } catch {
    return "";
  }
}

/**
 * Structured request/response logging for Cloudflare observability.
 * Never logs request or response bodies (spec R5).
 */
export function logRequest(
  method: string,
  path: string,
  status: number,
  durationMs: number,
  meta: LogMeta = {},
): void {
  const entry = {
    method,
    path,
    status,
    durationMs,
    ...(meta.webhookId && { webhookId: meta.webhookId }),
    ...(meta.clientIp && { clientIp: meta.clientIp }),
  };

  if (status >= 400) {
    console.error(JSON.stringify(entry));
  } else {
    console.log(JSON.stringify(entry));
  }
}
