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
});