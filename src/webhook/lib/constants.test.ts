import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_WEBHOOK_QUOTA,
  getWebhookQuota,
  getWebhookTtlDays,
  isRateLimitDisabled,
  isWebhookQuotaDisabled,
} from "./constants";

// QC verification (DRK-280): the operator kill-switch contract was flipped — rate limiting and
// the per-IP webhook quota now default to DISABLED (the live-env scenario: nothing is enforced
// unless an operator explicitly opts in). Only the documented "false"/"0"/"no" spellings
// re-enable; every other value (incl. "true"/"1"/"yes" and garbage) leaves the limit disabled.
// A caller cannot influence this per request — both read process.env, never request state.

describe("isRateLimitDisabled", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.DISABLE_RATE_LIMIT;
    delete process.env.DISABLE_RATE_LIMIT;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.DISABLE_RATE_LIMIT;
    else process.env.DISABLE_RATE_LIMIT = original;
  });

  it("disables the rate limit when DISABLE_RATE_LIMIT is unset (default off)", () => {
    expect(isRateLimitDisabled()).toBe(true);
  });

  it("disables the rate limit when DISABLE_RATE_LIMIT is an empty string", () => {
    process.env.DISABLE_RATE_LIMIT = "";
    expect(isRateLimitDisabled()).toBe(true);
  });

  it.each(["false", "0", "no"])("re-enables the rate limit for opt-in value %q", (value) => {
    process.env.DISABLE_RATE_LIMIT = value;
    expect(isRateLimitDisabled()).toBe(false);
  });

  it.each(["true", "1", "yes", "off", "disabled", "maybe", "something"])(
    "keeps the rate limit disabled for non-opt-in value %q",
    (value) => {
      process.env.DISABLE_RATE_LIMIT = value;
      expect(isRateLimitDisabled()).toBe(true);
    },
  );

  it("is case-insensitive — FALSE / No / 0 also re-enable", () => {
    process.env.DISABLE_RATE_LIMIT = "FALSE";
    expect(isRateLimitDisabled()).toBe(false);
    process.env.DISABLE_RATE_LIMIT = "No";
    expect(isRateLimitDisabled()).toBe(false);
    process.env.DISABLE_RATE_LIMIT = "0";
    expect(isRateLimitDisabled()).toBe(false);
  });

  it("does not trim — a padded value stays disabled", () => {
    process.env.DISABLE_RATE_LIMIT = " false ";
    expect(isRateLimitDisabled()).toBe(true);
  });
});

// QC verification (DRK-280): the per-IP webhook quota config contract. `getWebhookQuota` returns
// the explicit cap when one is set, `null` when unset or explicitly disabled, and falls back to
// the safe default (5) for any invalid explicit value — never fail open to a weird number. The
// route pairs this with `isWebhookQuotaDisabled`: the quota is only enforced when the operator
// opts in via DISABLE_WEBHOOK_QUOTA=false/0/no AND provides a cap (explicit or via the default
// fallback for invalid values).

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

  beforeEach(() => {
    originalQuota = process.env.WEBHOOK_QUOTA;
    delete process.env.WEBHOOK_QUOTA;
  });

  afterEach(() => {
    if (originalQuota === undefined) delete process.env.WEBHOOK_QUOTA;
    else process.env.WEBHOOK_QUOTA = originalQuota;
  });

  it("shares the single source of truth — DEFAULT_WEBHOOK_QUOTA is 5", () => {
    expect(DEFAULT_WEBHOOK_QUOTA).toBe(5);
  });

  it("returns null (no quota) when WEBHOOK_QUOTA is unset — the quota is opt-in", () => {
    delete process.env.WEBHOOK_QUOTA;
    expect(getWebhookQuota()).toBeNull();
  });

  it("returns null (no quota) when WEBHOOK_QUOTA is an empty string", () => {
    process.env.WEBHOOK_QUOTA = "";
    expect(getWebhookQuota()).toBeNull();
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

  it("disables the quota when DISABLE_WEBHOOK_QUOTA is unset (default off)", () => {
    expect(isWebhookQuotaDisabled()).toBe(true);
  });

  it("disables the quota when DISABLE_WEBHOOK_QUOTA is an empty string", () => {
    process.env.DISABLE_WEBHOOK_QUOTA = "";
    expect(isWebhookQuotaDisabled()).toBe(true);
  });

  it.each(["false", "0", "no"])("re-enables the quota for opt-in value %q", (value) => {
    process.env.DISABLE_WEBHOOK_QUOTA = value;
    expect(isWebhookQuotaDisabled()).toBe(false);
  });

  it.each(["true", "1", "yes", "off", "disabled", "maybe"])(
    "keeps the quota disabled for non-opt-in value %q",
    (value) => {
      process.env.DISABLE_WEBHOOK_QUOTA = value;
      expect(isWebhookQuotaDisabled()).toBe(true);
    },
  );

  it("is case-insensitive — FALSE / No / 0 also re-enable", () => {
    process.env.DISABLE_WEBHOOK_QUOTA = "FALSE";
    expect(isWebhookQuotaDisabled()).toBe(false);
    process.env.DISABLE_WEBHOOK_QUOTA = "No";
    expect(isWebhookQuotaDisabled()).toBe(false);
    process.env.DISABLE_WEBHOOK_QUOTA = "0";
    expect(isWebhookQuotaDisabled()).toBe(false);
  });

  it("does not trim — a padded value stays disabled", () => {
    process.env.DISABLE_WEBHOOK_QUOTA = " false ";
    expect(isWebhookQuotaDisabled()).toBe(true);
  });
});
// DRK-2061 §9: Q1 (warn once per process per distinct raw value) and Q2 (a digits-only period too
// large to count in milliseconds is a bad value). Each test uses its own raw values because the
// warned-value memory lives for the whole module instance.
describe("getWebhookTtlDays", () => {
  let original: string | undefined;

  beforeEach(() => {
    original = process.env.WEBHOOK_TTL_DAYS;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.WEBHOOK_TTL_DAYS;
    else process.env.WEBHOOK_TTL_DAYS = original;
    vi.restoreAllMocks();
  });

  it("Q1: warns once for a repeated bad value and once more for a different bad value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    process.env.WEBHOOK_TTL_DAYS = "q1-first";
    expect(getWebhookTtlDays()).toBe(7);
    expect(getWebhookTtlDays()).toBe(7);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenLastCalledWith('WEBHOOK_TTL_DAYS="q1-first" is not a whole number of days; using 7.');

    process.env.WEBHOOK_TTL_DAYS = "q1-second";
    expect(getWebhookTtlDays()).toBe(7);
    expect(warn).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenLastCalledWith('WEBHOOK_TTL_DAYS="q1-second" is not a whole number of days; using 7.');
  });

  it("Q2: keeps the largest period that still counts in safe milliseconds, with no warning", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WEBHOOK_TTL_DAYS = "104249991";

    expect(getWebhookTtlDays()).toBe(104249991);
    expect(warn).not.toHaveBeenCalled();
  });

  it("Q2: falls back to 7 with a warning one day past the safe-millisecond limit", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WEBHOOK_TTL_DAYS = "104249992";

    expect(getWebhookTtlDays()).toBe(7);
    expect(warn).toHaveBeenCalledExactlyOnceWith('WEBHOOK_TTL_DAYS="104249992" is not a whole number of days; using 7.');
  });

  it("Q2: falls back to 7 with a warning for a huge digits-only value", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    process.env.WEBHOOK_TTL_DAYS = "99999999999999999999";

    expect(getWebhookTtlDays()).toBe(7);
    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'WEBHOOK_TTL_DAYS="99999999999999999999" is not a whole number of days; using 7.',
    );
  });
});
