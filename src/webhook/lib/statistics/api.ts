import type {
  CleanupPreview,
  CleanupResult,
  RecentRequests,
  Storage,
  Traffic,
  TrafficWindow,
  WebhookList,
} from "@/lib/statistics";

export type ApiFailure = "network" | "not_found";

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

export async function getTraffic(window: TrafficWindow): Promise<ApiResult<Traffic>> {
  const response = await send(`/api/statistics/traffic?window=${encodeURIComponent(window)}`);
  if (!response) return fail("network");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as Traffic);
}

export async function getStorage(): Promise<ApiResult<Storage>> {
  const response = await send("/api/statistics/storage");
  if (!response) return fail("network");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as Storage);
}

export async function listWebhooks(q: string): Promise<ApiResult<WebhookList>> {
  const query = q ? `?q=${encodeURIComponent(q)}` : "";
  const response = await send(`/api/statistics/webhooks${query}`);
  if (!response) return fail("network");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as WebhookList);
}

export async function listWebhookRequests(id: string, limit: number): Promise<ApiResult<RecentRequests>> {
  const response = await send(
    `/api/statistics/webhooks/${encodeURIComponent(id)}/requests?limit=${encodeURIComponent(limit)}`,
  );
  if (!response) return fail("network");
  if (response.status === 404) return fail("not_found");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as RecentRequests);
}

export async function previewCleanup(): Promise<ApiResult<CleanupPreview>> {
  const response = await send("/api/statistics/cleanup");
  if (!response) return fail("network");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as CleanupPreview);
}

export async function runCleanup(): Promise<ApiResult<CleanupResult>> {
  const response = await send("/api/statistics/cleanup", { method: "DELETE" });
  if (!response) return fail("network");
  if (!response.ok) return fail("network");
  return ok((await response.json()) as CleanupResult);
}
