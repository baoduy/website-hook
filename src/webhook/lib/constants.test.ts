import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_WEBHOOK_QUOTA, getWebhookQuota, isRateLimitDisabled, isWebhookQuotaDisabled } from "./constants";

// `NODE_ENV` is declared read-only in @types/node's ProcessEnv interface, so mutating it for the
// quota-config tests routes through a writable view of process.env rather than the typed surface.
const env = process.env as Record<string, string | undefined>;
const setNodeEnv = (value: string | undefined) => {
  if (value === undefined) delete env.NODE_ENV;
  else env.NODE_ENV = value;
};

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

// QC verification (DRK-275): the per-IP webhook quota config contract (spec §5/§D4, DRK-272 §6 R3).
// `getWebhookQuota` must fail to the safe default (5) — never fail open to unlimited — for any value
// that is not an explicit disable. `isWebhookQuotaDisabled` mirrors the rate-limit kill-switch
// convention: only the documented truthy strings disable, everything else enforces. Both read
// process.env only; no request input can reach them (spec §5 Security).

describe("getWebhookQuota", () => {
  const cases: Array<[string, number | null]> = [
    ["5", 5],
    ["3", 3],
    ["10", 10],
    ["0", null],
    ["disabled", null],
    ["DISABLED", null],
    ["Disabled", null],
    ["abc", 5],
    ["-1", 5],
    ["-5", 5],
    ["1.5", 1.5],
    [" ", 5],
    ["0x10", 16],
  ];

  let originalQuota: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalQuota = process.env.WEBHOOK_QUOTA;
    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.WEBHOOK_QUOTA;
    // The quota's production default is 5 regardless of NODE_ENV; pin to a non-test value so the
    // unset/empty-string cases prove the deployed default, not the in-process test convenience seam.
    setNodeEnv("production");
  });

  afterEach(() => {
    if (originalQuota === undefined) delete process.env.WEBHOOK_QUOTA;
    else process.env.WEBHOOK_QUOTA = originalQuota;
    setNodeEnv(originalNodeEnv);
  });

  it("shares the single source of truth — DEFAULT_WEBHOOK_QUOTA is 5", () => {
    expect(DEFAULT_WEBHOOK_QUOTA).toBe(5);
  });

  it("defaults to the safe default (5) when WEBHOOK_QUOTA is unset", () => {
    delete process.env.WEBHOOK_QUOTA;
    expect(getWebhookQuota()).toBe(DEFAULT_WEBHOOK_QUOTA);
  });

  it("defaults to the safe default (5) when WEBHOOK_QUOTA is an empty string", () => {
    process.env.WEBHOOK_QUOTA = "";
    expect(getWebhookQuota()).toBe(DEFAULT_WEBHOOK_QUOTA);
  });

  it.each(cases)("parses %q -> %s", (value, expected) => {
    process.env.WEBHOOK_QUOTA = value;
    expect(getWebhookQuota()).toBe(expected);
  });

  it('"0" and "disabled" both disable the quota (null), and only those spellings do', () => {
    process.env.WEBHOOK_QUOTA = "0";
    expect(getWebhookQuota()).toBeNull();
    process.env.WEBHOOK_QUOTA = "disabled";
    expect(getWebhookQuota()).toBeNull();
    process.env.WEBHOOK_QUOTA = "off";
    expect(getWebhookQuota()).toBe(5); // "off" is NOT a disable spelling — fail to the safe default
  });

  it("never fails open to unlimited — every invalid value falls back to 5, never to null", () => {
    for (const value of ["abc", "-1", "NaN", "Infinity", "{}"]) {
      process.env.WEBHOOK_QUOTA = value;
      expect(getWebhookQuota()).toBe(DEFAULT_WEBHOOK_QUOTA);
    }
  });
});

describe("getWebhookQuota — in-process test seam", () => {
  let originalQuota: string | undefined;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    originalQuota = process.env.WEBHOOK_QUOTA;
    originalNodeEnv = process.env.NODE_ENV;
    delete process.env.WEBHOOK_QUOTA;
  });

  afterEach(() => {
    if (originalQuota === undefined) delete process.env.WEBHOOK_QUOTA;
    else process.env.WEBHOOK_QUOTA = originalQuota;
    setNodeEnv(originalNodeEnv);
  });

  it("disables the quota (null) when unset under NODE_ENV=test so the legacy suite stays unblocked", () => {
    setNodeEnv("test");
    expect(getWebhookQuota()).toBeNull();
  });

  it("still honours an explicit WEBHOOK_QUOTA under NODE_ENV=test — the seam only fills the unset case", () => {
    setNodeEnv("test");
    process.env.WEBHOOK_QUOTA = "3";
    expect(getWebhookQuota()).toBe(3);
    process.env.WEBHOOK_QUOTA = "disabled";
    expect(getWebhookQuota()).toBeNull();
  });
});

describe("isWebhookQuotaDisabled", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.DISABLE_WEBHOOK_QUOTA;
    delete process.env.DISABLE_WEBHOOK_QUOTA;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DISABLE_WEBHOOK_QUOTA;
    else process.env.DISABLE_WEBHOOK_QUOTA = original;
  });

  it("enforces the quota when DISABLE_WEBHOOK_QUOTA is unset (default on)", () => {
    expect(isWebhookQuotaDisabled()).toBe(false);
  });

  it("enforces the quota when DISABLE_WEBHOOK_QUOTA is an empty string", () => {
    process.env.DISABLE_WEBHOOK_QUOTA = "";
    expect(isWebhookQuotaDisabled()).toBe(false);
  });

  it.each(["false", "0", "no", "off", "disabled"])(
    "enforces the quota for non-truthy value %q",
    (value) => {
      process.env.DISABLE_WEBHOOK_QUOTA = value;
      expect(isWebhookQuotaDisabled()).toBe(false);
    },
  );

  it.each(["true", "1", "yes"])("disables the quota for truthy value %q", (value) => {
    process.env.DISABLE_WEBHOOK_QUOTA = value;
    expect(isWebhookQuotaDisabled()).toBe(true);
  });

  it("is case-insensitive — TRUE / Yes also disable", () => {
    process.env.DISABLE_WEBHOOK_QUOTA = "TRUE";
    expect(isWebhookQuotaDisabled()).toBe(true);
    process.env.DISABLE_WEBHOOK_QUOTA = "Yes";
    expect(isWebhookQuotaDisabled()).toBe(true);
  });

  it("does not trim — a padded value keeps the quota enforced", () => {
    process.env.DISABLE_WEBHOOK_QUOTA = " true ";
    expect(isWebhookQuotaDisabled()).toBe(false);
  });
});