import { MAX_REMEMBERED_WEBHOOKS, STORAGE_KEY } from "@/lib/constants";

// Only webhook ids live here — never a payload, a header or a credential. The list is a browser
// convenience: losing it loses the shortcuts, not the webhooks (they live on until they idle out).
// Pure functions over a passed-in Storage so the fallbacks are exercisable without a browser.

/** Absent, non-JSON, wrong-shape and over-long stored data all degrade to a usable list. */
export function readIds(storage: Storage): string[] {
  let raw: string | null;
  try {
    raw = storage.getItem(STORAGE_KEY);
  } catch {
    return [];
  }
  if (!raw) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const ids = parsed.filter((id): id is string => typeof id === "string" && id.length > 0);
  return dedupe(ids).slice(0, MAX_REMEMBERED_WEBHOOKS);
}

/** Writes the capped, de-duplicated list and returns exactly what was stored. */
export function writeIds(storage: Storage, ids: string[]): string[] {
  const capped = dedupe(ids).slice(0, MAX_REMEMBERED_WEBHOOKS);
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(capped));
  } catch {
    // A full or blocked storage costs persistence, not the session.
  }
  return capped;
}

/** Newest first — a freshly created webhook goes to the top of the rail. */
export function addId(storage: Storage, ids: string[], id: string): string[] {
  return writeIds(storage, [id, ...ids]);
}

export function removeId(storage: Storage, ids: string[], id: string): string[] {
  return writeIds(
    storage,
    ids.filter((stored) => stored !== id),
  );
}

export function clearIds(storage: Storage): string[] {
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Same as above — nothing to recover from.
  }
  return [];
}

function dedupe(ids: string[]): string[] {
  return [...new Set(ids)];
}
