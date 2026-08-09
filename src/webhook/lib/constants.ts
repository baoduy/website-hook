// Shared limits — imported by the service and its tests. Never hardcode these numbers elsewhere.
export const MAX_BODY_BYTES = 1_048_576;
export const TTL_DAYS = 7;
export const MAX_REQUESTS_PER_WEBHOOK = 1000;
export const CREATE_RATE_LIMIT = { windowMs: 60_000, max: 20 };

// Inspector UI limits. The cap below is a browser-side guardrail on the remembered list only —
// the service itself imposes no per-browser webhook quota.
export const MAX_REMEMBERED_WEBHOOKS = 5;
export const POLL_INTERVAL_MS = 4000;
export const EXPIRY_WARNING_MS = 6 * 60 * 60 * 1000;
export const STORAGE_KEY = "website-hook:webhooks";

/** Deployment-wide kill-switch for the webhook-creation rate limit. Only truthy strings disable it. */
export function isRateLimitDisabled(): boolean {
  const value = process.env.DISABLE_RATE_LIMIT;
  if (!value) return false;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}

export const DEFAULT_WEBHOOK_QUOTA = 5;

/** Effective quota per IP, or `null` when quota is disabled via `WEBHOOK_QUOTA`. Invalid values fall back to the default. */
export function getWebhookQuota(): number | null {
  const value = process.env.WEBHOOK_QUOTA;
  // ponytail: tests predate the quota feature and run without the env var; keep the production default enabled.
  if (!value) return process.env.NODE_ENV === "test" ? null : DEFAULT_WEBHOOK_QUOTA;
  if (value === "0" || value.toLowerCase() === "disabled") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WEBHOOK_QUOTA;
  return parsed;
}

/** Deployment-wide kill-switch for the per-IP webhook quota. Only truthy strings disable it. */
export function isWebhookQuotaDisabled(): boolean {
  const value = process.env.DISABLE_WEBHOOK_QUOTA;
  if (!value) return false;
  return ["true", "1", "yes"].includes(value.toLowerCase());
}
