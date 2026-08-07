// ponytail: single-instance in-memory limiter, not shared across replicas — move to a shared store (Redis) if this ever runs >1 instance.
const hits = new Map<string, number[]>();

/** True if `key` has already made `max` requests within the trailing `windowMs`. Records this request either way. */
export function isRateLimited(key: string, windowMs: number, max: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);

  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }

  recent.push(now);
  hits.set(key, recent);
  return false;
}
