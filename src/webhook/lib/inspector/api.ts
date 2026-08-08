// Typed browser client for the public webhook API. Every call resolves to a tagged result —
// callers branch on `ok`/`error` rather than catching, so a rate limit or an expired webhook
// is ordinary control flow instead of an exception.

export type CreatedWebhook = {
  id: string;
  url: string;
  createdAt: number;
  expiresAt: number;
};

export type WebhookSummary = {
  id: string;
  createdAt: number;
  lastActivityAt: number;
  requestCount: number;
  expiresAt: number;
};

export type CapturedRequest = {
  id: string;
  method: string;
  path: string;
  query: string;
  headers: Record<string, string>;
  /** base64 — opaque bytes, never parsed server-side. */
  body: string;
  truncated: boolean;
  createdAt: number;
};

export type RequestPage = {
  items: CapturedRequest[];
  nextCursor: string | null;
};

/** `gone` = the server no longer has this webhook (404). `rate_limited` = 429 on create. */
export type ApiFailure = "gone" | "rate_limited" | "network";

export type ApiResult<T> = { ok: true; value: T } | { ok: false; error: ApiFailure };

const ok = <T>(value: T): ApiResult<T> => ({ ok: true, value });
const fail = <T>(error: ApiFailure): ApiResult<T> => ({ ok: false, error });

async function send(path: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(path, init);
  } catch {
    return null;
  }
}

export async function createWebhook(): Promise<ApiResult<CreatedWebhook>> {
  const response = await send("/api/webhooks", { method: "POST" });
  if (!response) return fail("network");
  if (response.status === 429) return fail("rate_limited");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as CreatedWebhook);
}

export async function getWebhook(id: string): Promise<ApiResult<WebhookSummary>> {
  const response = await send(`/api/webhooks/${encodeURIComponent(id)}`);
  if (!response) return fail("network");
  if (response.status === 404) return fail("gone");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as WebhookSummary);
}

/** Idempotent server-side: a 204 and a 404 both mean "it is gone now". */
export async function deleteWebhook(id: string): Promise<ApiResult<null>> {
  const response = await send(`/api/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (!response) return fail("network");
  if (!response.ok && response.status !== 404) return fail("network");
  return ok(null);
}

export async function listRequests(
  id: string,
  cursor: string | null,
  limit: number,
): Promise<ApiResult<RequestPage>> {
  const query = new URLSearchParams({ limit: String(limit) });
  if (cursor) query.set("cursor", cursor);

  const response = await send(`/api/webhooks/${encodeURIComponent(id)}/requests?${query}`);
  if (!response) return fail("network");
  if (response.status === 404) return fail("gone");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as RequestPage);
}

export async function getRequest(id: string, requestId: string): Promise<ApiResult<CapturedRequest>> {
  const response = await send(
    `/api/webhooks/${encodeURIComponent(id)}/requests/${encodeURIComponent(requestId)}`,
  );
  if (!response) return fail("network");
  if (response.status === 404) return fail("gone");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as CapturedRequest);
}
