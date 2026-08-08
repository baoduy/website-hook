// Captured bodies are opaque bytes. Decoding degrades to a byte count rather than throwing —
// no captured payload may make the viewer unusable.

export type DecodedBody =
  | { kind: "empty"; byteLength: 0 }
  | { kind: "json"; byteLength: number; text: string; pretty: string }
  | { kind: "text"; byteLength: number; text: string }
  | { kind: "binary"; byteLength: number };

function toBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Never throws: undecodable input comes back as `binary` with the byte count we could measure. */
export function decodeBody(base64: string): DecodedBody {
  if (!base64) return { kind: "empty", byteLength: 0 };

  let bytes: Uint8Array;
  try {
    bytes = toBytes(base64);
  } catch {
    return { kind: "binary", byteLength: base64Bytes(base64) };
  }

  if (bytes.byteLength === 0) return { kind: "empty", byteLength: 0 };

  let text: string;
  try {
    // `fatal` is the point — invalid UTF-8 must fail here rather than render as replacement chars.
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return { kind: "binary", byteLength: bytes.byteLength };
  }

  const pretty = prettyJson(text);
  if (pretty !== null) return { kind: "json", byteLength: bytes.byteLength, text, pretty };
  return { kind: "text", byteLength: bytes.byteLength, text };
}

/** Decoded text, or an empty string for empty and binary bodies (search and cURL both want this). */
export function decodeBodyText(base64: string): string {
  const decoded = decodeBody(base64);
  return decoded.kind === "json" || decoded.kind === "text" ? decoded.text : "";
}

/** Byte length without decoding — base64 expands 3 bytes into 4 characters. */
export function base64Bytes(base64: string): number {
  return Math.floor((base64 || "").replace(/=+$/, "").length * 3 / 4);
}

/**
 * Pretty-printed JSON, or null when the text is not a JSON object or array.
 * A bare scalar (`42`, `"ok"`, `null`) reads better in the raw pane than in a gutter-numbered
 * one-liner, so it deliberately falls through here — matching the design contract.
 */
export function prettyJson(text: string): string | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== "object") return null;
  return JSON.stringify(parsed, null, 2);
}
