import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isRateLimitDisabled } from "./constants";

// Independent QC verification of the operator rate-limit kill-switch contract (spec R4):
// disabling is deployment-wide config only; only the documented truthy strings turn it off,
// everything else (incl. the explicit "false" edge case) keeps the 20/min/IP limit enforced.
// A caller cannot influence this per request — it reads process.env, never request state.

let original: string | undefined;

beforeEach(() => {
  original = process.env.DISABLE_RATE_LIMIT;
  delete process.env.DISABLE_RATE_LIMIT;
});

afterEach(() => {
  if (original === undefined) delete process.env.DISABLE_RATE_LIMIT;
  else process.env.DISABLE_RATE_LIMIT = original;
});

describe("isRateLimitDisabled", () => {
  it("enforces the rate limit when DISABLE_RATE_LIMIT is unset (default on)", () => {
    expect(isRateLimitDisabled()).toBe(false);
  });

  it("enforces the rate limit when DISABLE_RATE_LIMIT is an empty string", () => {
    process.env.DISABLE_RATE_LIMIT = "";
    expect(isRateLimitDisabled()).toBe(false);
  });

  it.each(["false", "0", "no", "off", "disabled"])(
    "enforces the rate limit for non-truthy value %q",
    (value) => {
      process.env.DISABLE_RATE_LIMIT = value;
      expect(isRateLimitDisabled()).toBe(false);
    },
  );

  it.each(["true", "1", "yes"])("disables the rate limit for truthy value %q", (value) => {
    process.env.DISABLE_RATE_LIMIT = value;
    expect(isRateLimitDisabled()).toBe(true);
  });

  it("is case-insensitive — TRUE / Yes also disable", () => {
    process.env.DISABLE_RATE_LIMIT = "TRUE";
    expect(isRateLimitDisabled()).toBe(true);
    process.env.DISABLE_RATE_LIMIT = "Yes";
    expect(isRateLimitDisabled()).toBe(true);
  });

  it("does not trim — a padded value keeps the rate limit enforced", () => {
    process.env.DISABLE_RATE_LIMIT = " true ";
    expect(isRateLimitDisabled()).toBe(false);
  });
});