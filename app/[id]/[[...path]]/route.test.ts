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
    const webhook = db.createWebhook();

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

    const [stored] = db.listCapturedRequests(webhook.id, 1, null).items;
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
    const webhook = db.createWebhook();

    await PUT(new NextRequest(`http://localhost/${webhook.id}/orders/42`, { method: "PUT" }), {
      params: Promise.resolve({ id: webhook.id, path: ["orders", "42"] }),
    });

    const [stored] = db.listCapturedRequests(webhook.id, 1, null).items;
    expect(stored.method).toBe("PUT");
    expect(stored.path).toBe("/orders/42");
  });

  it("resets the webhook's idle-expiry clock on every capture", async () => {
    const db = await import("@/lib/db");
    const { POST } = await import("./route");
    const webhook = db.createWebhook();
    const before = db.getWebhook(webhook.id)!.lastActivityAt;

    await new Promise((r) => setTimeout(r, 5));
    await POST(new NextRequest(`http://localhost/${webhook.id}`, { method: "POST" }), {
      params: Promise.resolve({ id: webhook.id, path: [] }),
    });

    expect(db.getWebhook(webhook.id)!.lastActivityAt).toBeGreaterThan(before);
  });

  it("truncates a body over the shared MAX_BODY_BYTES cap and flags it, still answering 200", async () => {
    const db = await import("@/lib/db");
    const { POST } = await import("./route");
    const webhook = db.createWebhook();
    const oversized = "a".repeat(MAX_BODY_BYTES + 1024);

    const res = await POST(new NextRequest(`http://localhost/${webhook.id}`, { method: "POST", body: oversized }), {
      params: Promise.resolve({ id: webhook.id, path: [] }),
    });

    expect(res.status).toBe(200);
    const [stored] = db.listCapturedRequests(webhook.id, 1, null).items;
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
