import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_BODY_BYTES } from "@/lib/constants";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-capture-"));
  process.env.DB_PATH = path.join(dir, "webhook.db");
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe("capture handler", () => {
  it("captures method, path, query, headers, and body in full, and answers 200", async () => {
    const db = await import("@/lib/db");
    const { POST } = await import("./route");
    const webhook = await db.createWebhook();

    const res = await POST(
      new NextRequest(`http://localhost/${webhook.id}?a=b`, {
        method: "POST",
        headers: { "x-custom": "yes", "content-type": "application/json" },
        body: JSON.stringify({ hello: "world" }),
      }),
      { params: Promise.resolve({ id: webhook.id, path: [] }) },
    );

    expect(res.status).toBe(200);
    expect(await res.text()).toBe("");

    const [stored] = (await db.listCapturedRequests(webhook.id, 1, null)).items;
    expect(stored.method).toBe("POST");
    expect(stored.path).toBe("");
    expect(stored.query).toBe("a=b");
    expect(stored.headers["x-custom"]).toBe("yes");
    expect(JSON.parse(stored.body.toString())).toEqual({ hello: "world" });
    expect(stored.truncated).toBe(false);
  });

  it("captures any method against any sub-path beneath the capture URL, preserving both", async () => {
    const db = await import("@/lib/db");
    const { PUT } = await import("./route");
    const webhook = await db.createWebhook();

    await PUT(new NextRequest(`http://localhost/${webhook.id}/orders/42`, { method: "PUT" }), {
      params: Promise.resolve({ id: webhook.id, path: ["orders", "42"] }),
    });

    const [stored] = (await db.listCapturedRequests(webhook.id, 1, null)).items;
    expect(stored.method).toBe("PUT");
    expect(stored.path).toBe("/orders/42");
  });

  it("resets the webhook's idle-expiry clock on every capture", async () => {
    const db = await import("@/lib/db");
    const { POST } = await import("./route");
    const webhook = await db.createWebhook();
    const before = (await db.getWebhook(webhook.id))!.lastActivityAt;

    await new Promise((r) => setTimeout(r, 5));
    await POST(new NextRequest(`http://localhost/${webhook.id}`, { method: "POST" }), {
      params: Promise.resolve({ id: webhook.id, path: [] }),
    });

    expect((await db.getWebhook(webhook.id))!.lastActivityAt).toBeGreaterThan(before);
  });

  it("truncates a body over the shared MAX_BODY_BYTES cap and flags it, still answering 200", async () => {
    const db = await import("@/lib/db");
    const { POST } = await import("./route");
    const webhook = await db.createWebhook();
    const oversized = "a".repeat(MAX_BODY_BYTES + 1024);

    const res = await POST(new NextRequest(`http://localhost/${webhook.id}`, { method: "POST", body: oversized }), {
      params: Promise.resolve({ id: webhook.id, path: [] }),
    });

    expect(res.status).toBe(200);
    const [stored] = (await db.listCapturedRequests(webhook.id, 1, null)).items;
    expect(stored.truncated).toBe(true);
    expect(stored.body.length).toBe(MAX_BODY_BYTES);
  });

  it("404s for an unknown or expired webhook instead of capturing", async () => {
    const { GET } = await import("./route");
    const res = await GET(new NextRequest("http://localhost/does-not-exist"), {
      params: Promise.resolve({ id: "does-not-exist", path: [] }),
    });
    expect(res.status).toBe(404);
  });
});

describe("capture handler — structured logging (DRK-280)", () => {
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.resetModules();
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-capture-log-"));
    process.env.DB_PATH = path.join(dir, "webhook.db");
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it("logs a 200 capture as JSON with method/path/webhookId/clientIp and never the body", async () => {
    const db = await import("@/lib/db");
    const { POST } = await import("./route");
    const webhook = await db.createWebhook();

    const res = await POST(
      new NextRequest(`http://localhost/${webhook.id}/orders/42`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.7" },
        body: JSON.stringify({ secret: "never-log-me" }),
      }),
      { params: Promise.resolve({ id: webhook.id, path: ["orders", "42"] }) },
    );
    expect(res.status).toBe(200);
    expect(logSpy).toHaveBeenCalledOnce();

    const entry = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(entry.method).toBe("POST");
    expect(entry.path).toBe(`/${webhook.id}/orders/42`);
    expect(entry.status).toBe(200);
    expect(entry.webhookId).toBe(webhook.id);
    expect(entry.clientIp).toBe("203.0.113.7");
    expect(typeof entry.durationMs).toBe("number");
    expect("body" in entry).toBe(false);
    // The request body must not appear anywhere in the emitted log line.
    expect(logSpy.mock.calls[0][0]).not.toContain("never-log-me");
  });

  it("logs a 404 for an unknown webhook to console.error with the webhookId", async () => {
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://localhost/does-not-exist", { method: "POST" }), {
      params: Promise.resolve({ id: "does-not-exist", path: [] }),
    });
    expect(res.status).toBe(404);
    expect(errorSpy).toHaveBeenCalledOnce();
    expect(logSpy).not.toHaveBeenCalled();
    const entry = JSON.parse(errorSpy.mock.calls[0][0] as string);
    expect(entry.status).toBe(404);
    expect(entry.webhookId).toBe("does-not-exist");
  });
});
