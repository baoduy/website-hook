import { describe, expect, it } from "vitest";
import { isSensitiveHeader } from "./headers";

describe("isSensitiveHeader", () => {
  it.each(["Authorization", "authorization", "AUTHORIZATION"])("flags %q", (name) => {
    expect(isSensitiveHeader(name)).toBe(true);
  });
  it.each(["X-Signature", "Signature", "x-token", "Bearer-Token", "X-Idempotency-Key", "secret"])(
    "flags %q",
    (name) => {
      expect(isSensitiveHeader(name)).toBe(true);
    },
  );
  it.each(["Content-Type", "Accept", "User-Agent", "Host", "X-Request-Id"])(
    "does not flag ordinary header %q",
    (name) => {
      expect(isSensitiveHeader(name)).toBe(false);
    },
  );
});