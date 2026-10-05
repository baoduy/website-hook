// Shared limits — imported by the service and its tests. Never hardcode these numbers elsewhere.
export const MAX_BODY_BYTES = 1_048_576;
export const TTL_DAYS = 7;
export const MAX_REQUESTS_PER_WEBHOOK = 1000;
export const CLEANUP_AGE_DAYS = 30;
export const CREATE_RATE_LIMIT = { windowMs: 60_000, max: 20 };

/** Status-page traffic windows and their bucket size. */
export const TRAFFIC_WINDOWS = {
  "24h": { ms: 24 * 60 * 60 * 1000, bucketMs: 60 * 60 * 1000 },
  "3d": { ms: 3 * 24 * 60 * 60 * 1000, bucketMs: 3 * 60 * 60 * 1000 },
  "7d": { ms: 7 * 24 * 60 * 60 * 1000, bucketMs: 6 * 60 * 60 * 1000 },
  "30d": { ms: 30 * 24 * 60 * 60 * 1000, bucketMs: 24 * 60 * 60 * 1000 },
} as const;

export type TrafficWindow = keyof typeof TRAFFIC_WINDOWS;

// Inspector UI limits. The cap below is a browser-side guardrail on the remembered list only —
// the service itself imposes no per-browser webhook quota.
export const MAX_REMEMBERED_WEBHOOKS = 5;
export const POLL_INTERVAL_MS = 4000;
export const EXPIRY_WARNING_MS = 6 * 60 * 60 * 1000;
export const STORAGE_KEY = "website-hook:webhooks";

/** Deployment-wide kill-switch for the webhook-creation rate limit. Defaults to disabled; only explicit "false"/"0"/"no" re-enables it. */
export function isRateLimitDisabled(): boolean {
  const value = process.env.DISABLE_RATE_LIMIT;
  if (!value) return true;
  return !["false", "0", "no"].includes(value.toLowerCase());
}

export const DAY_MS = 86_400_000;

const warnedTtlValues = new Set<string>();

/**
 * Idle period in days for webhooks created now, or `null` when they never expire (`WEBHOOK_TTL_DAYS=0`).
 * Unset or empty keeps TTL_DAYS. Anything but digits only — or a period too large to count in
 * milliseconds — falls back to TTL_DAYS with one warning per process per distinct value.
 */
export function getWebhookTtlDays(): number | null {
  const value = process.env.WEBHOOK_TTL_DAYS;
  if (!value) return TTL_DAYS;
  if (/^\d+$/.test(value)) {
    const days = Number(value);
    if (days === 0) return null;
    if (Number.isSafeInteger(days * DAY_MS)) return days;
  }
  if (!warnedTtlValues.has(value)) {
    warnedTtlValues.add(value);
    console.warn(`WEBHOOK_TTL_DAYS="${value}" is not a valid number of days; using ${TTL_DAYS}.`);
  }
  return TTL_DAYS;
}

export const DEFAULT_WEBHOOK_QUOTA = 5;

/** Effective quota per IP, or `null` when quota is disabled. Explicit `WEBHOOK_QUOTA` values still apply when quota is enabled. */
export function getWebhookQuota(): number | null {
  const value = process.env.WEBHOOK_QUOTA;
  if (!value) return null;
  if (value === "0" || value.toLowerCase() === "disabled") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_WEBHOOK_QUOTA;
  return parsed;
}

/** Deployment-wide kill-switch for the per-IP webhook quota. Defaults to disabled; only explicit "false"/"0"/"no" re-enables it. */
export function isWebhookQuotaDisabled(): boolean {
  const value = process.env.DISABLE_WEBHOOK_QUOTA;
  if (!value) return true;
  return !["false", "0", "no"].includes(value.toLowerCase());
}
