import { EXPIRY_WARNING_MS } from "@/lib/constants";

const pad = (n: number) => String(n).padStart(2, "0");

/** "12s ago" / "4m ago" / "3h ago" / "2d ago". Clamped at 0 so clock skew never reads negative. */
export function relativeTime(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}

/** "in 42m" / "in 5h" / "in 3d". */
export function timeUntil(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((timestamp - now) / 1000));
  if (seconds < 3600) return `in ${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `in ${Math.floor(seconds / 3600)}h`;
  return `in ${Math.floor(seconds / 86400)}d`;
}

export function formatBytes(byteLength: number): string {
  if (!byteLength) return "no body";
  return byteLength < 1024 ? `${byteLength} B` : `${(byteLength / 1024).toFixed(1)} KB`;
}

/**
 * "14:07:33 · 08 Aug" — local time. Day and month are composed here rather than left to
 * `toLocaleDateString`, whose field order follows the locale (en-US would give "Aug 08").
 */
export function formatStamp(timestamp: number): string {
  const date = new Date(timestamp);
  const clock = `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
  const month = date.toLocaleDateString(undefined, { month: "short" });
  return `${clock} · ${pad(date.getDate())} ${month}`;
}

/** "457fb06b…049d" — enough of a UUID to recognise, short enough for the rail. */
export function shortId(id: string): string {
  return id.length <= 12 ? id : `${id.slice(0, 8)}…${id.slice(-4)}`;
}

export function isExpiringSoon(expiresAt: number, now: number): boolean {
  return expiresAt - now < EXPIRY_WARNING_MS;
}
