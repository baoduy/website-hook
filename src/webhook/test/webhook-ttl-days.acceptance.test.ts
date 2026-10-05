import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import document from "@/lib/openapi.json";

// Acceptance tests — DRK-2061 §5 "Idle-period setting for website-hook webhooks" (@integration
// scenarios). Each test drives the real route handlers / lib entry points against a temp SQLite
// file, the same harness as lib/db.test.ts. Expected values are literals from the spec.

const DAY_MS = 86_400_000;
const IP = "203.0.113.7";
const ENV_KEYS = ["WEBHOOK_TTL_DAYS", "WEBHOOK_QUOTA", "DISABLE_WEBHOOK_QUOTA", "DISABLE_RATE_LIMIT"] as const;

let dir: string;
let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-ttl-days-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
  savedEnv = Object.fromEntries(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) delete process.env[key];
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.useRealTimers();
  vi.restoreAllMocks();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** `undefined` = the setting is not set. */
function setSetting(value: string | undefined) {
  if (value === undefined) delete process.env.WEBHOOK_TTL_DAYS;
  else process.env.WEBHOOK_TTL_DAYS = value;
}

async function store() {
  const { ensureSchema, getClient } = await import("@/lib/prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  return prisma;
}

/** Operator creates a webhook through the public API; returns the parsed creation result. */
async function createViaApi(ip: string = IP): Promise<{ status: number; body: Record<string, unknown> }> {
  const { POST } = await import("@/app/api/webhooks/route");
  const res = await POST(
    new NextRequest("http://localhost/api/webhooks", {
      method: "POST",
      headers: { "x-forwarded-for": ip, host: "example.com" },
    }),
  );
  return { status: res.status, body: await res.json() };
}

async function createWebhookId(): Promise<string> {
  const { body } = await createViaApi();
  return body.id as string;
}

async function readViaApi(id: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const { GET } = await import("@/app/api/webhooks/[id]/route");
  const res = await GET(new Request(`http://localhost/api/webhooks/${id}`), { params: Promise.resolve({ id }) });
  return { status: res.status, body: res.status === 200 ? await res.json() : {} };
}

/** A request arrives at the webhook's capture address; returns the HTTP status. */
async function sendToCaptureAddress(id: string): Promise<number> {
  const { POST } = await import("@/app/[id]/[[...path]]/route");
  const res = await POST(new NextRequest(`http://localhost/${id}`, { method: "POST", body: "ping" }), {
    params: Promise.resolve({ id, path: [] }),
  });
  return res.status;
}

/** The idle period stored on the webhook, in days; `null` = never expires. */
async function storedPeriod(id: string): Promise<number | null> {
  const prisma = await store();
  const rows = await prisma.$queryRaw<{ ttl_days: bigint | number | null }[]>`
    SELECT ttl_days FROM webhooks WHERE id = ${id}
  `;
  return rows[0].ttl_days === null ? null : Number(rows[0].ttl_days);
}

async function webhookExists(id: string): Promise<boolean> {
  const prisma = await store();
  const rows = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM webhooks WHERE id = ${id}`;
  return rows.length === 1;
}

async function capturedCount(id: string): Promise<number> {
  const prisma = await store();
  const rows = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT COUNT(*) AS c FROM captured_requests WHERE webhook_id = ${id}
  `;
  return Number(rows[0].c);
}

async function setIdleDays(id: string, days: number) {
  const prisma = await store();
  await prisma.$executeRaw`
    UPDATE webhooks SET last_activity_at = ${BigInt(Date.now() - days * DAY_MS)} WHERE id = ${id}
  `;
}

async function setCreatedDaysAgo(id: string, days: number) {
  const prisma = await store();
  const at = BigInt(Date.now() - days * DAY_MS);
  await prisma.$executeRaw`UPDATE webhooks SET created_at = ${at}, last_activity_at = ${at} WHERE id = ${id}`;
}

async function addCapturedRequest(id: string) {
  const db = await import("@/lib/db");
  await db.insertCapturedRequest(id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
}

/** Webhook created while the setting had `value` (undefined = not set). */
async function createUnderSetting(value: string | undefined): Promise<string> {
  setSetting(value);
  return createWebhookId();
}

function silenceWarnings() {
  return vi.spyOn(console, "warn").mockImplementation(() => {});
}

function warnedAbout(warn: ReturnType<typeof silenceWarnings>, value: string): boolean {
  return warn.mock.calls.some((args) => args.map(String).join(" ").includes(value));
}

describe("Scenario Outline: The setting decides the period of a new webhook", () => {
  const examples: Array<{ name: string; setting: string | undefined; period: number | null; expiry: number | null }> = [
    { name: "not set", setting: undefined, period: 7, expiry: Date.UTC(2026, 9, 12, 9, 0) },
    { name: "empty", setting: "", period: 7, expiry: Date.UTC(2026, 9, 12, 9, 0) },
    { name: '"0"', setting: "0", period: null, expiry: null },
    { name: '"30"', setting: "30", period: 30, expiry: Date.UTC(2026, 10, 4, 9, 0) },
  ];

  for (const example of examples) {
    it(`Example: setting ${example.name} — period ${example.period ?? "never"}, expiry ${example.expiry === null ? "none" : new Date(example.expiry).toISOString()}`, async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(Date.UTC(2026, 9, 5, 9, 0));
      const warn = silenceWarnings();
      setSetting(example.setting);

      const { status, body } = await createViaApi();

      expect(status).toBe(201);
      expect(body).toHaveProperty("expiresAt", example.expiry);
      expect(await storedPeriod(body.id as string)).toBe(example.period);
      expect(warn).not.toHaveBeenCalled();
    });
  }
});

describe("Scenario Outline: A bad setting falls back to 7 days with a warning", () => {
  for (const value of ["-1", "abc", "1.5", " 30 ", "1e2"]) {
    it(`Example: ${JSON.stringify(value)} — 7 days and a warning naming the value`, async () => {
      const warn = silenceWarnings();
      setSetting(value);

      const { body } = await createViaApi();

      expect(await storedPeriod(body.id as string)).toBe(7);
      expect((body.expiresAt as number) - (body.createdAt as number)).toBe(7 * DAY_MS);
      expect(warnedAbout(warn, value)).toBe(true);
    });
  }
});

describe("Input domain (brief §6a D3–D5): digits-only values", () => {
  it('D3: "1" (lower boundary) gives a 1-day period', async () => {
    setSetting("1");
    const { body } = await createViaApi();

    expect(await storedPeriod(body.id as string)).toBe(1);
    expect((body.expiresAt as number) - (body.createdAt as number)).toBe(DAY_MS);
  });

  it('D4: "+30" is another notation — 7 days and a warning naming the value', async () => {
    const warn = silenceWarnings();
    setSetting("+30");
    const { body } = await createViaApi();

    expect(await storedPeriod(body.id as string)).toBe(7);
    expect(warnedAbout(warn, "+30")).toBe(true);
  });

  it('D5: "00" is digits only and zero — never expires', async () => {
    setSetting("00");
    const { body } = await createViaApi();

    expect(await storedPeriod(body.id as string)).toBeNull();
    expect(body).toHaveProperty("expiresAt", null);
  });

  it('D5: "007" is digits only — 7 days, no warning', async () => {
    const warn = silenceWarnings();
    setSetting("007");
    const { body } = await createViaApi();

    expect(await storedPeriod(body.id as string)).toBe(7);
    expect(warn).not.toHaveBeenCalled();
  });
});

describe("Scenario Outline: A never-expiring webhook keeps working after a long idle time", () => {
  it('Example: a request arrives at the capture address of "orders-hook" — the request is captured', async () => {
    const ordersHook = await createUnderSetting("0");
    await setIdleDays(ordersHook, 400);
    expect(await capturedCount(ordersHook)).toBe(0);

    expect(await sendToCaptureAddress(ordersHook)).toBe(200);
    expect(await capturedCount(ordersHook)).toBe(1);
  });

  it('Example: operator "ops-team" reads "orders-hook" through the API — returned with no expiry time', async () => {
    const ordersHook = await createUnderSetting("0");
    await setIdleDays(ordersHook, 400);

    const { status, body } = await readViaApi(ordersHook);

    expect(status).toBe(200);
    expect(body).toHaveProperty("id", ordersHook);
    expect(body).toHaveProperty("expiresAt", null);
  });
});

describe("Scenario: A never-expiring webhook keeps its period after the service restarts", () => {
  it("replays the migrations on the same database file and still captures after 30 idle days", async () => {
    const ordersHook = await createUnderSetting("0");
    setSetting("7");

    // Service restart: fresh module registry, so ensureSchema replays every migration file
    // against the same on-disk database (brief §8).
    vi.resetModules();
    const { ensureSchema, getClient } = await import("@/lib/prisma");
    await ensureSchema(getClient());

    await setIdleDays(ordersHook, 30);

    expect(await sendToCaptureAddress(ordersHook)).toBe(200);
    expect(await capturedCount(ordersHook)).toBe(1);
    expect(await storedPeriod(ordersHook)).toBeNull();
  });
});

describe("Scenario Outline: A never-expiring webhook reports no expiry time", () => {
  it("Example: receives the creation result", async () => {
    setSetting("0");
    const { status, body } = await createViaApi();

    expect(status).toBe(201);
    expect(body).toHaveProperty("expiresAt", null);
  });

  it('Example: reads "orders-hook" through the API', async () => {
    const ordersHook = await createUnderSetting("0");

    const { status, body } = await readViaApi(ordersHook);

    expect(status).toBe(200);
    expect(body).toHaveProperty("expiresAt", null);
  });

  it("Example: lists webhooks on the status page", async () => {
    const ordersHook = await createUnderSetting("0");
    const { GET } = await import("@/app/api/statistics/webhooks/route");

    const res = await GET(new NextRequest("http://localhost/api/statistics/webhooks"));
    const { items } = (await res.json()) as { items: Array<Record<string, unknown>> };
    const row = items.find((item) => item.id === ordersHook);

    expect(row).toBeDefined();
    expect(row).toHaveProperty("expiresAt", null);
  });
});

describe("Scenario Outline: A webhook expires by its own period, counted from its last request", () => {
  for (const { idle, answer, status } of [
    { idle: 29, answer: "request captured", status: 200 },
    { idle: 31, answer: "not found", status: 404 },
  ]) {
    it(`Example: idle ${idle} days — the capture address answers "${answer}"`, async () => {
      const auditHook = await createUnderSetting("30");
      setSetting("7");
      await setIdleDays(auditHook, idle);

      expect(await sendToCaptureAddress(auditHook)).toBe(status);
      expect(await capturedCount(auditHook)).toBe(status === 200 ? 1 : 0);
    });
  }
});

describe("Scenario: A webhook created under 0 keeps never expiring after the setting changes", () => {
  it('captures a request for "forever-hook" after 30 idle days with the setting now "7"', async () => {
    const foreverHook = await createUnderSetting("0");
    setSetting("7");
    await setIdleDays(foreverHook, 30);

    expect(await sendToCaptureAddress(foreverHook)).toBe(200);
    expect(await capturedCount(foreverHook)).toBe(1);
  });
});

describe("Scenario: Webhooks that exist at rollout get 7 days", () => {
  it('gives "legacy-hook" an idle period of 7 days when rolled out with the setting at "0"', async () => {
    // Before the rollout: the database holds only the migrations that existed before this change.
    const dbPath = process.env.DB_PATH!;
    const legacy = new PrismaClient({ datasourceUrl: `file:${dbPath}` });
    for (const migration of ["0_init", "1_webhook_creator_ip"]) {
      const sql = fs
        .readFileSync(path.join(process.cwd(), "prisma", "migrations", migration, "migration.sql"), "utf-8")
        .replace(/--.*$/gm, "");
      for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
        await legacy.$executeRawUnsafe(`${statement};`);
      }
    }
    const legacyHook = "00000000-0000-4000-8000-000000000001";
    const lastActivityAt = Date.now() - DAY_MS;
    await legacy.$executeRaw`
      INSERT INTO webhooks (id, created_at, last_activity_at, creator_ip)
      VALUES (${legacyHook}, ${BigInt(lastActivityAt)}, ${BigInt(lastActivityAt)}, '')
    `;
    await legacy.$disconnect();

    // The rollout: the service starts with the setting at "0" and replays every migration.
    setSetting("0");
    vi.resetModules();

    expect(await storedPeriod(legacyHook)).toBe(7);
    const { status, body } = await readViaApi(legacyHook);
    expect(status).toBe(200);
    expect(body).toHaveProperty("expiresAt", lastActivityAt + 7 * DAY_MS);
  });
});

describe("Scenario: The hourly purge deletes only webhooks past their own period", () => {
  it('deletes "short-hook" and its captured requests and keeps "forever-hook"', async () => {
    const shortHook = await createUnderSetting(undefined);
    await addCapturedRequest(shortHook);
    await setIdleDays(shortHook, 8);
    const foreverHook = await createUnderSetting("0");
    await setIdleDays(foreverHook, 8);
    expect(await webhookExists(shortHook)).toBe(true);
    expect(await capturedCount(shortHook)).toBe(1);
    expect(await webhookExists(foreverHook)).toBe(true);

    const { purgeExpiredWebhooks } = await import("@/lib/db");
    await purgeExpiredWebhooks();

    expect(await webhookExists(shortHook)).toBe(false);
    expect(await capturedCount(shortHook)).toBe(0);
    expect(await webhookExists(foreverHook)).toBe(true);
  });
});

async function runManualCleanup(): Promise<unknown> {
  const { DELETE } = await import("@/app/api/statistics/cleanup/route");
  const res = await DELETE(new NextRequest("http://localhost/api/statistics/cleanup", { method: "DELETE" }));
  return res.json();
}

async function previewManualCleanup(): Promise<unknown> {
  const { GET } = await import("@/app/api/statistics/cleanup/route");
  const res = await GET(new NextRequest("http://localhost/api/statistics/cleanup"));
  return res.json();
}

describe("Scenario: The manual cleanup deletes nothing while the setting is 0", () => {
  it('keeps "old-hook" and reports 0 webhooks and 0 requests deleted', async () => {
    const oldHook = await createUnderSetting("0");
    await addCapturedRequest(oldHook);
    await setCreatedDaysAgo(oldHook, 45);
    expect(await webhookExists(oldHook)).toBe(true);
    expect(await capturedCount(oldHook)).toBe(1);

    const result = await runManualCleanup();

    expect(result).toEqual({ deletedWebhooks: 0, deletedRequests: 0 });
    expect(await webhookExists(oldHook)).toBe(true);
    expect(await capturedCount(oldHook)).toBe(1);
  });
});

describe("Scenario: The cleanup preview is empty and says webhooks never expire while the setting is 0", () => {
  it("lists no webhooks and states that the current period is never", async () => {
    const oldHook = await createUnderSetting("0");
    await addCapturedRequest(oldHook);
    await setCreatedDaysAgo(oldHook, 45);

    expect(await previewManualCleanup()).toEqual({ webhooks: [], totalRequests: 0, webhookTtlDays: null });
  });

  it('(§6a D7 presence) lists "old-hook" and states 30 days while the setting is "30"', async () => {
    const oldHook = await createUnderSetting("30");
    await addCapturedRequest(oldHook);
    await setCreatedDaysAgo(oldHook, 45);

    expect(await previewManualCleanup()).toEqual({
      webhooks: [{ id: oldHook, requestCount: 1 }],
      totalRequests: 1,
      webhookTtlDays: 30,
    });
  });

  it("(§6a D7 presence) states 7 days while the setting is not set", async () => {
    setSetting(undefined);

    expect(await previewManualCleanup()).toEqual({ webhooks: [], totalRequests: 0, webhookTtlDays: 7 });
  });
});

describe("Scenario: The manual cleanup removes old never-expiring webhooks once the setting is positive (@existing)", () => {
  it('deletes "forever-hook" and its captured requests with the setting now "7"', async () => {
    const foreverHook = await createUnderSetting("0");
    await addCapturedRequest(foreverHook);
    await setCreatedDaysAgo(foreverHook, 45);
    setSetting("7");
    expect(await webhookExists(foreverHook)).toBe(true);
    expect(await capturedCount(foreverHook)).toBe(1);

    const result = await runManualCleanup();

    expect(result).toEqual({ deletedWebhooks: 1, deletedRequests: 1 });
    expect(await webhookExists(foreverHook)).toBe(false);
    expect(await capturedCount(foreverHook)).toBe(0);
  });
});

describe("Scenario Outline: The per-IP quota counts only webhooks that have not expired", () => {
  for (const { period, setting, status, outcome } of [
    { period: "never", setting: "0", status: 429, outcome: "is refused because the quota is used up" },
    { period: "7-day", setting: undefined, status: 201, outcome: "succeeds" },
  ]) {
    it(`Example: ${period} period — the creation ${outcome}`, async () => {
      process.env.WEBHOOK_QUOTA = "2";
      process.env.DISABLE_WEBHOOK_QUOTA = "false";
      setSetting(setting);
      const first = await createViaApi(IP);
      const second = await createViaApi(IP);
      expect([first.status, second.status]).toEqual([201, 201]);
      await setIdleDays(first.body.id as string, 10);
      await setIdleDays(second.body.id as string, 10);

      const third = await createViaApi(IP);

      expect(third.status).toBe(status);
      if (status === 429) expect(third.body).toEqual({ error: "quota_exceeded" });
    });
  }
});

describe("Scenario: The API reference explains a missing expiry time and the current period", () => {
  type Operation = { description?: string };
  const paths = (document as unknown as { paths: Record<string, Record<string, Operation>> }).paths;

  for (const [route, method] of [
    ["/api/webhooks", "post"],
    ["/api/webhooks/{id}", "get"],
    ["/api/statistics/webhooks", "get"],
  ] as const) {
    it(`says a missing expiry time means the webhook never expires — ${method.toUpperCase()} ${route}`, () => {
      expect(paths[route][method].description).toMatch(/expiresAt`? is null when the webhook never expires/);
    });
  }

  it("describes the current idle period in the cleanup preview — GET /api/statistics/cleanup", () => {
    const description = paths["/api/statistics/cleanup"].get.description;
    expect(description).toMatch(/webhookTtlDays/);
    expect(description).toMatch(/idle period/i);
    expect(description).toMatch(/null[^.]*never/i);
  });

  it("says the cleanup deletes nothing while the setting is 0 — DELETE /api/statistics/cleanup", () => {
    expect(paths["/api/statistics/cleanup"].delete.description).toMatch(/deletes nothing while[^.]*0/i);
  });
});
