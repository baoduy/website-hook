// ponytail: single-instance in-memory limiter, not shared across replicas — move to a shared store (Redis) if this ever runs >1 instance.
const hits = new Map<string, number[]>();
let lastEvictedAt = 0;
const EVICT_INTERVAL_MS = 1000;

/** True if `key` has already made `max` requests within the trailing `windowMs`. Records this request either way. */
export function isRateLimited(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();

  // ponytail: scan at most once per second to bound memory without blocking the hot path.
  if (now - lastEvictedAt >= EVICT_INTERVAL_MS) {
    lastEvictedAt = now;
    for (const [k, times] of hits) {
      if (times[times.length - 1] < now - windowMs) {
        hits.delete(k);
      }
    }
  }

  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }

  recent.push(now);
  hits.set(key, recent);
  return false;
}
