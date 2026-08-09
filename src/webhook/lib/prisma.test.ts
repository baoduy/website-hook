import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

let dir: string;
let dbPath: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "wh-prisma-"));
  dbPath = path.join(dir, "webhook.db");
  process.env.DB_PATH = dbPath;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("schema provisioning", () => {
  it("auto-provisions the schema on first use with no pre-existing DB file — no manual migrate step", async () => {
    expect(fs.existsSync(dbPath)).toBe(false);

    const { ensureSchema, getClient } = await import("./prisma");
    const prisma = getClient();
    await expect(ensureSchema(prisma)).resolves.not.toThrow();

    expect(fs.existsSync(dbPath)).toBe(true);

    // Immediately usable: a real write through the provisioned schema works.
    const db = await import("./db");
    const webhook = await db.createWebhook();
    expect(webhook.id).toBeTruthy();
  });

  it("is idempotent: provisioning twice on an already-initialised DB keeps existing data intact (R8)", async () => {
    const db = await import("./db");
    const webhook = await db.createWebhook();
    await db.insertCapturedRequest(webhook.id, {
      method: "POST",
      path: "/x",
      query: "",
      headers: {},
      body: Buffer.from("payload"),
      truncated: false,
    });

    // Simulate a fresh process pointing at the existing DB: reload modules and re-run provisioning.
    vi.resetModules();
    const { ensureSchema, getClient } = await import("./prisma");
    const prisma = getClient();
    await expect(ensureSchema(prisma)).resolves.not.toThrow();

    const reopened: typeof import("./db") = await import("./db");
    const info = await reopened.getWebhook(webhook.id);
    expect(info?.requestCount).toBe(1);
    const [stored] = (await reopened.listCapturedRequests(webhook.id, 1, null)).items;
    expect(stored.body.toString()).toBe("payload");
  });

  it("creates the DB_PATH directory when it does not exist", async () => {
    const nestedDir = path.join(dir, "nested", "deep");
    const nestedDbPath = path.join(nestedDir, "webhook.db");
    process.env.DB_PATH = nestedDbPath;
    expect(fs.existsSync(nestedDir)).toBe(false);

    const { getClient } = await import("./prisma");
    getClient(); // mkdirs the parent directory lazily
    expect(fs.existsSync(nestedDir)).toBe(true);
  });

  it("builds the datasource URL from a relative DB_PATH joined to cwd", async () => {
    // Covers the non-absolute branch of resolveDbPath; keeps a relative path resolvable against cwd.
    process.env.DB_PATH = path.relative(process.cwd(), path.join(dir, "rel.db"));
    const { getClient } = await import("./prisma");
    const prisma = getClient();
    expect(prisma).toBeTruthy();
    // A relative path must still resolve to an absolute, writable file location.
    const { createWebhook } = await import("./db");
    expect((await createWebhook()).id).toBeTruthy();
  });
});

// QC verification (DRK-280): the D1 migration repair. ensureSchema now walks every migration in
// `prisma/migrations` in sorted order and applies each, instead of only 0_init. The live-env
// scenario: a database that already had 0_init recorded (with creator_ip from a botched prior
// deploy) must not crash when migration 1 re-adds creator_ip — SQLite has no ADD COLUMN IF NOT
// EXISTS, so the duplicate-column error is swallowed and the rest of the migration continues.

import { PrismaClient } from "@prisma/client";

async function columnExists(prisma: PrismaClient, table: string, column: string): Promise<boolean> {
  const rows = (await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT name FROM pragma_table_info(?) WHERE name = ?`,
    table,
    column,
  )) as unknown as { name: string }[];
  return rows.length > 0;
}

describe("schema provisioning — ordered multi-migration application (DRK-280)", () => {
  it("applies all migrations in order on a fresh DB — creator_ip arrives via migration 1, not 0_init", async () => {
    const { ensureSchema, getClient } = await import("./prisma");
    const prisma = getClient();
    await ensureSchema(prisma);

    // The webhooks table from 0_init must exist…
    const tables = (await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='webhooks'`,
    )) as unknown as { name: string }[];
    expect(tables.length).toBe(1);

    // …and the creator_ip column from migration 1 must be present.
    expect(await columnExists(prisma, "webhooks", "creator_ip")).toBe(true);
    expect(await columnExists(prisma, "webhooks", "last_activity_at")).toBe(true);
  });

  it("is idempotent against a partially-migrated DB that already has creator_ip — duplicate column is swallowed", async () => {
    // Simulate the live-env botched state: 0_init already applied WITH creator_ip baked in
    // (the old, broken migration). build that schema directly, then run ensureSchema — it must
    // not throw on the duplicate creator_ip ADD COLUMN from migration 1.
    const { getClient } = await import("./prisma");
    const prisma = getClient();
    await prisma.$executeRawUnsafe(
      `CREATE TABLE "webhooks" ("id" TEXT NOT NULL PRIMARY KEY, "created_at" BIGINT NOT NULL, "last_activity_at" BIGINT NOT NULL, "creator_ip" TEXT NOT NULL DEFAULT '');`,
    );

    const { ensureSchema } = await import("./prisma");
    await expect(ensureSchema(prisma)).resolves.not.toThrow();

    expect(await columnExists(prisma, "webhooks", "creator_ip")).toBe(true);
    // The captured_requests table from 0_init must also have been applied in the same pass.
    const reqTables = (await prisma.$queryRawUnsafe<{ name: string }[]>(
      `SELECT name FROM sqlite_master WHERE type='table' AND name='captured_requests'`,
    )) as unknown as { name: string }[];
    expect(reqTables.length).toBe(1);
  });
});