// Header names worth a second look when reading a captured request — signatures, bearer tokens,
// idempotency keys. Highlighting only; nothing is redacted, the whole point is to inspect it.
const SENSITIVE = /signature|authorization|token|secret|idempotency/i;

export function isSensitiveHeader(name: string): boolean {
  return SENSITIVE.test(name);
}
