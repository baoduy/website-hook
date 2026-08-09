import type { CapturedRequest } from "./api";
import { decodeBodyText } from "./body";

export const METHOD_FILTERS = ["ALL", "GET", "POST", "PUT", "PATCH", "DEL"] as const;
export type MethodFilter = (typeof METHOD_FILTERS)[number];

/** `DEL` is the label that fits the segmented control; the wire method is DELETE. */
export function resolveMethod(filter: MethodFilter): string | null {
  if (filter === "ALL") return null;
  return filter === "DEL" ? "DELETE" : filter;
}

function haystack(request: CapturedRequest): string {
  const headers = Object.entries(request.headers)
    .map(([name, value]) => `${name}: ${value}`)
    .join("\n");
  return [request.method, request.path, request.query, headers, decodeBodyText(request.body)]
    .join(" ")
    .toLowerCase();
}

export function filterRequests(
  requests: CapturedRequest[],
  search: string,
  method: MethodFilter,
): CapturedRequest[] {
  const needle = search.trim().toLowerCase();
  const wanted = resolveMethod(method);

  return requests.filter((request) => {
    if (wanted && request.method !== wanted) return false;
    if (!needle) return true;
    return haystack(request).includes(needle);
  });
}

/** Filtering must never land the detail pane on nothing while matching rows remain. */
export function resolveSelection(
  filtered: CapturedRequest[],
  selectedId: string | null,
): CapturedRequest | null {
  return filtered.find((request) => request.id === selectedId) ?? filtered[0] ?? null;
}
