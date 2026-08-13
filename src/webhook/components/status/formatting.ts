export function formatBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1_048_576).toFixed(2)} MB`;
}

export function formatNumber(n: number): string {
  return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

export function relativeTime(now: number, ts: number): string {
  const d = Math.max(0, Math.floor((now - ts) / 1000));
  if (d < 60) return `${d}s ago`;
  if (d < 3600) return `${Math.floor(d / 60)}m ago`;
  if (d < 86400) return `${Math.floor(d / 3600)}h ago`;
  return `${Math.floor(d / 86400)}d ago`;
}

export function untilTime(now: number, ts: number): string {
  const d = Math.floor((ts - now) / 1000);
  if (d <= 0) return "expired";
  if (d < 3600) return `in ${Math.floor(d / 60)}m`;
  if (d < 86400) return `in ${Math.floor(d / 3600)}h`;
  return `in ${Math.floor(d / 86400)}d`;
}

export function bucketLabel(t: number, window: string): string {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  if (window === "24h") return `${p(d.getHours())}:00`;
  if (window === "30d") return `${p(d.getDate())}/${p(d.getMonth() + 1)}`;
  return `${p(d.getDate())} ${p(d.getHours())}h`;
}
