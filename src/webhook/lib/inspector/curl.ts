import type { CapturedRequest } from "./api";
import { decodeBodyText } from "./body";

// `host` and `content-length` describe the original hop, not the request being replayed.
const DROPPED_HEADERS = new Set(["host", "content-length"]);

/**
 * Wraps a value for a single-quoted shell argument. Captured data is hostile input — every
 * interpolated value goes through here so a crafted header can never break out of its quotes.
 */
function shellQuote(value: string): string {
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/** The cURL that replays this captured request against its own endpoint. */
export function buildCurl(request: CapturedRequest, baseUrl: string, webhookId: string): string {
  const url = `${baseUrl}/${webhookId}${request.path}${request.query ? `?${request.query}` : ""}`;
  // The method comes from the capture route's fixed handler exports, never from caller text — the
  // contract prints it unquoted. Everything else below is captured data and stays quoted.
  const lines = [`curl -X ${request.method} ${shellQuote(url)}`];

  for (const [name, value] of Object.entries(request.headers)) {
    if (DROPPED_HEADERS.has(name.toLowerCase())) continue;
    lines.push(`  -H ${shellQuote(`${name}: ${value}`)}`);
  }

  const body = decodeBodyText(request.body);
  if (body) lines.push(`  --data-raw ${shellQuote(body)}`);

  return lines.join(" \\\n");
}
