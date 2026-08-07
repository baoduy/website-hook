import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { TTL_DAYS } from "./lib/constants";

const SWEEP_INTERVAL_MS = 60 * 60 * 1000;

let dir: string;
let dbPath: string;
let originalRuntime: string | undefined;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-sweep-"));
  dbPath = path.join(dir, "webhook.db");
  process.env.DB_PATH = dbPath;
  originalRuntime = process.env.NEXT_RUNTIME;
});

afterEach(() => {
  vi.useRealTimers();
  process.env.NEXT_RUNTIME = originalRuntime;
  fs.rmSync(dir, { recursive: true, force: true });
});

async function seedLastActivityDaysAgo(id: string, days: number) {
  const { ensureSchema, getClient } = await import("./lib/prisma");
  const prisma = getClient();
  await ensureSchema(prisma);
  await prisma.webhook.update({
    where: { id },
    data: { lastActivityAt: BigInt(Date.now() - days * 24 * 60 * 60 * 1000) },
  });
}

describe("register", () => {
  it("does nothing outside the nodejs runtime (e.g. edge) — no sweep is scheduled", async () => {
    process.env.NEXT_RUNTIME = "edge";
    vi.useFakeTimers();
    const db = await import("./lib/db");
    const purgeSpy = vi.spyOn(db, "purgeExpiredWebhooks");
    const { register } = await import("./instrumentation");

    await register();
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS * 2);

    expect(purgeSpy).not.toHaveBeenCalled();
  });

  it("purges an idle webhook and its captured data on the hourly sweep — real enforcement, not a read-time filter", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    vi.useFakeTimers();

    const db = await import("./lib/db");
    const webhook = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, { method: "GET", path: "", query: "", headers: {}, body: Buffer.alloc(0), truncated: false });
    // Seed idle activity from TTL_DAYS + 1 days ago — no request has arrived since, per the scenario.
    await seedLastActivityDaysAgo(webhook.id, TTL_DAYS + 1);

    const { register } = await import("./instrumentation");
    await register();
    await vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS);

    expect(await db.getWebhook(webhook.id)).toBeNull();

    // The capture endpoint must 404 as a consequence of the purge, not require a hit to trigger it.
    const { GET } = await import("./app/[id]/[[...path]]/route");
    const { NextRequest } = await import("next/server");
    const res = await GET(new NextRequest(`http://localhost/${webhook.id}`), {
      params: Promise.resolve({ id: webhook.id, path: [] }),
    });
    expect(res.status).toBe(404);
  });

  it("logs and survives a sweep failure instead of crashing the interval", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    vi.useFakeTimers();
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    const db = await import("./lib/db");
    vi.spyOn(db, "purgeExpiredWebhooks").mockImplementation(() => {
      throw new Error("disk error");
    });

    const { register } = await import("./instrumentation");
    await register();
    await expect(vi.advanceTimersByTimeAsync(SWEEP_INTERVAL_MS)).resolves.not.toThrow();

    expect(consoleError).toHaveBeenCalledWith("idle webhook sweep failed:", expect.any(Error));
    consoleError.mockRestore();
  });
});
