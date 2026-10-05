import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { forwardHeaders } from "@/scripts/start-ui.mjs";

// Acceptance tests — DRK-2086 §5, the parts of the UI-image scenarios provable without Docker.
// The API side is driven through its route handlers against a temp SQLite file; the UI side
// through the forwarder's header seam. A call through the UI reaches the API on its internal
// address (`http://website-hook-api:3000`) carrying the caller's host (`localhost:8080`).
// The Docker-backed half of each scenario lives in api-ui-images.docker.test.ts.

const API_URL = "http://website-hook-api:3000";
const UI_HOST = "localhost:8080";

let dir: string;

beforeEach(() => {
  vi.resetModules();
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "webhook-api-ui-"));
  vi.stubEnv("DB_PATH", path.join(dir, "webhook.db"));
  vi.stubEnv("WEBHOOK_QUOTA", undefined);
  vi.stubEnv("DISABLE_WEBHOOK_QUOTA", undefined);
  vi.stubEnv("DISABLE_RATE_LIMIT", undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** POST /api/webhooks as the API receives it; `headers` are what reaches the API. */
async function createWebhook(headers: Record<string, string>) {
  const { POST } = await import("@/app/api/webhooks/route");
  const res = await POST(new NextRequest(`${API_URL}/api/webhooks`, { method: "POST", headers }));
  return { status: res.status, body: await res.json() };
}

describe("Scenario Outline: Addresses in responses follow the UI address", () => {
  it("a new webhook — the returned capture URL starts with the UI address", async () => {
    const created = await createWebhook({ host: UI_HOST, "x-forwarded-proto": "http" });

    expect(created.status).toBe(201);
    expect(created.body.url).toBe(`http://localhost:8080/${created.body.id}`);
  });

  it("the OpenAPI file — the server address starts with the UI address", async () => {
    const { GET } = await import("@/app/openapi.json/route");

    const res = await GET(
      new NextRequest(`${API_URL}/openapi.json`, { headers: { host: UI_HOST, "x-forwarded-proto": "http" } }),
    );
    const document = await res.json();

    expect(document.servers[0].url).toBe("http://localhost:8080");
  });
});

describe("Scenario: A caller cannot fake its address through the UI", () => {
  it("the API refuses the webhook because the quota for 203.0.113.7 is used", async () => {
    // Given the per-IP quota allows 1 webhook per caller
    vi.stubEnv("WEBHOOK_QUOTA", "1");
    // And caller "203.0.113.7" already owns 1 webhook
    const first = await createWebhook(
      forwardHeaders({ host: UI_HOST }, "203.0.113.7") as Record<string, string>,
    );
    expect(first.status).toBe(201);

    // When the same caller asks the UI for another webhook while claiming address "198.51.100.9"
    const claimed = forwardHeaders({ host: UI_HOST, "x-forwarded-for": "198.51.100.9" }, "203.0.113.7");
    const second = await createWebhook(claimed as Record<string, string>);

    // Then the API refuses the webhook because the quota for "203.0.113.7" is used
    expect(second.status).toBe(429);
    expect(second.body).toEqual({ error: "quota_exceeded" });
  });
});

describe("Scenario: The UI reports an unreachable API — the Inspector half (@existing)", () => {
  it("the Inspector treats the UI's bad gateway answer as its error state", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(Response.json({ error: "bad_gateway" }, { status: 502 })),
    );
    const api = await import("@/lib/inspector/api");

    expect(await api.createWebhook()).toEqual({ ok: false, error: "network" });
  });
});
