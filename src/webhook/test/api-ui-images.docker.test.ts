import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import path from "node:path";

// Acceptance tests — DRK-2086 §5 @integration scenarios for the API and UI images. Run with
// `npm run test:docker`: each suite builds its image target from src/webhook/Dockerfile and
// drives the running containers over HTTP with the docker CLI — no npm dependency added.
// Expected values are literals from the spec. The UI is published on host port 8080, the
// spec's own address; where 8080 is taken, WEBSITE_HOOK_UI_TEST_PORT moves it to a free port.

const APP_DIR = path.resolve(import.meta.dirname, "..");
const API_IMAGE = "ghcr.io/baoduy/website-hook-api:latest";
const UI_IMAGE = "ghcr.io/baoduy/website-hook-ui:latest";
const UI_PORT = process.env.WEBSITE_HOOK_UI_TEST_PORT ?? "8080";
const UI_ADDRESS = `http://localhost:${UI_PORT}`;
const WEBHOOK_ID = "7f3c2a10-0000-4000-8000-000000000001";
const ORDER_EVENT = JSON.stringify({ event: "order.created", orderId: "ord-1001", source: "billing-service" });

const RUN = randomUUID().slice(0, 8);
let sequence = 0;
const containers: string[] = [];
const networks: string[] = [];

function docker(...args: string[]): string {
  return execFileSync("docker", args, { cwd: APP_DIR, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function buildImage(target: "api" | "ui", tag: string) {
  execFileSync("docker", ["build", "--target", target, "-t", tag, "."], { cwd: APP_DIR, stdio: "inherit" });
}

function uniqueName(role: string) {
  return `wh-at-${RUN}-${role}-${++sequence}`;
}

function runContainer(role: string, runArgs: string[], image: string, command: string[] = []): string {
  const name = uniqueName(role);
  containers.push(name);
  docker("run", "-d", "--name", name, ...runArgs, image, ...command);
  return name;
}

function createNetwork(): string {
  const name = uniqueName("net");
  networks.push(name);
  docker("network", "create", name);
  return name;
}

function removeAll() {
  if (containers.length) spawnSync("docker", ["rm", "-f", ...containers.splice(0)]);
  if (networks.length) spawnSync("docker", ["network", "rm", ...networks.splice(0)]);
}

/** Waits until `url` answers with a status `ready` accepts. */
async function waitFor(url: string, ready: (status: number) => boolean = () => true, timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  let last = "no answer";
  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      if (ready(res.status)) return;
      last = `status ${res.status}`;
    } catch (error) {
      last = String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${url} not ready after ${timeoutMs} ms: ${last}`);
}

/** The API image on its own network with the alias the UI is linked to. */
function startApi(network: string, env: Record<string, string> = {}): string {
  const envArgs = Object.entries(env).flatMap(([key, value]) => ["-e", `${key}=${value}`]);
  return runContainer("api", ["--network", network, "--network-alias", "website-hook-api", ...envArgs], API_IMAGE);
}

function startUi(network: string) {
  runContainer("ui", ["--network", network, "-p", `${UI_PORT}:3000`, "-e", "WEBHOOK_API_URL=http://website-hook-api:3000"], UI_IMAGE);
}

/** The UI on http://localhost:8080 (UI_ADDRESS) linked to a running API on http://website-hook-api:3000. */
async function startLinkedUi(apiEnv: Record<string, string> = {}): Promise<string> {
  const network = createNetwork();
  const api = startApi(network, apiEnv);
  startUi(network);
  await waitFor(`${UI_ADDRESS}/openapi.json`, (status) => status === 200);
  return api;
}

function postOrderEvent(url: string) {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": "billing-service" },
    body: ORDER_EVENT,
  });
}

afterAll(removeAll);

describe("API image", () => {
  let container: string;
  let apiAddress: string;

  beforeAll(async () => {
    buildImage("api", API_IMAGE);
    container = runContainer("api", ["-p", "127.0.0.1::3000"], API_IMAGE);
    apiAddress = `http://127.0.0.1:${docker("port", container, "3000/tcp").split(":").pop()}`;
    // Ready once the app has answered a store lookup: it brings the database schema up to date
    // on first use, before which the seed below cannot write.
    await waitFor(`${apiAddress}/api/webhooks/${WEBHOOK_ID}`, (status) => status === 404);
  });

  it("Scenario: The API image captures a webhook", async () => {
    // Given the API image runs with webhook "7f3c2a10-0000-4000-8000-000000000001"
    docker(
      "exec",
      container,
      "node",
      "-e",
      `const { PrismaBetterSqlite3 } = require("@prisma/adapter-better-sqlite3");
       const { PrismaClient } = require("@prisma/client");
       const prisma = new PrismaClient({ adapter: new PrismaBetterSqlite3({ url: "file:" + process.env.DB_PATH }) });
       const now = BigInt(Date.now());
       prisma.webhook
         .create({ data: { id: process.argv[1], createdAt: now, lastActivityAt: now, creatorIp: "seed", ttlDays: 7 } })
         .finally(() => prisma.$disconnect());`,
      WEBHOOK_ID,
    );

    // When "billing-service" posts an order event to that webhook
    const posted = await postOrderEvent(`${apiAddress}/${WEBHOOK_ID}/orders`);
    expect(posted.status).toBe(200);

    // Then the API lists 1 captured request for that webhook
    const listed = await fetch(`${apiAddress}/api/webhooks/${WEBHOOK_ID}/requests`);
    expect(listed.status).toBe(200);
    const { items } = await listed.json();
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ method: "POST", path: "/orders", body: Buffer.from(ORDER_EVENT).toString("base64") });
  });

  it.each([
    ["Inspector page", "/"],
    ["Status page", "/status"],
  ])("Scenario Outline: The API image serves no UI pages — Mia opens the %s and it is not found", async (_page, pagePath) => {
    const res = await fetch(`${apiAddress}${pagePath}`);

    expect(res.status).toBe(404);
  });
});

describe("UI image", () => {
  beforeAll(() => {
    buildImage("api", API_IMAGE);
    buildImage("ui", UI_IMAGE);
  });

  describe("linked to a running API", () => {
    beforeAll(async () => {
      await startLinkedUi();
    });

    afterAll(removeAll);

    it("Scenario: A webhook posted through the UI address reaches the API", async () => {
      // And "Mia" created a webhook in the Inspector
      const inspector = await fetch(`${UI_ADDRESS}/`);
      expect(inspector.status).toBe(200);
      const created = await fetch(`${UI_ADDRESS}/api/webhooks`, { method: "POST" });
      expect(created.status).toBe(201);
      const webhook = await created.json();

      // When "billing-service" posts an order event to the capture URL the Inspector shows
      const posted = await postOrderEvent(`${webhook.url}/orders?source=billing`);
      expect(posted.status).toBe(200);

      // Then the Inspector lists 1 captured request for the webhook Mia created
      const listed = await fetch(`${UI_ADDRESS}/api/webhooks/${webhook.id}/requests`);
      expect(listed.status).toBe(200);
      const { items } = await listed.json();
      expect(items).toHaveLength(1);
      expect(items[0]).toMatchObject({
        method: "POST",
        path: "/orders",
        query: "source=billing",
        body: Buffer.from(ORDER_EVENT).toString("base64"),
      });
    });

    it("Scenario Outline: Addresses in responses follow the UI address — a new webhook, the returned capture URL", async () => {
      const created = await fetch(`${UI_ADDRESS}/api/webhooks`, { method: "POST" });
      const webhook = await created.json();

      expect(created.status).toBe(201);
      expect(webhook.url).toBe(`${UI_ADDRESS}/${webhook.id}`);
    });

    it("Scenario Outline: Addresses in responses follow the UI address — the OpenAPI file, the server address", async () => {
      const res = await fetch(`${UI_ADDRESS}/openapi.json`);
      const document = await res.json();

      expect(res.status).toBe(200);
      expect(document.servers[0].url).toBe(UI_ADDRESS);
    });
  });

  it.each([
    ["(none)", []],
    ['"website-hook-api:3000"', ["-e", "WEBHOOK_API_URL=website-hook-api:3000"]],
    ['"ftp://website-hook-api:3000"', ["-e", "WEBHOOK_API_URL=ftp://website-hook-api:3000"]],
  ])(
    "Scenario Outline: The UI refuses to start without a valid API address — address %s",
    (_address, envArgs) => {
      const name = uniqueName("ui-refused");
      containers.push(name);

      // When the UI container starts (attached, so its exit code and stderr come back here)
      const result = spawnSync("docker", ["run", "--name", name, ...envArgs, UI_IMAGE], {
        encoding: "utf8",
        timeout: 60_000,
        // An attached `docker run` ignores SIGTERM while its container keeps running.
        killSignal: "SIGKILL",
      });

      // Then it stops with an error that names the API address setting.
      // A timeout means the container kept running instead of stopping.
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      // The spec requires only that the error names the setting, so stderr is matched on that name.
      expect(result.stderr).toContain("WEBHOOK_API_URL");
    },
  );

  describe("Scenario: The UI reports an unreachable API", () => {
    afterEach(removeAll);

    it("the UI answers the Inspector's API calls with bad gateway when its API is stopped", async () => {
      // Given the UI runs and its API is stopped
      const api = await startLinkedUi();
      docker("stop", api);

      // When "Mia" opens the Inspector
      const inspector = await fetch(`${UI_ADDRESS}/`);
      expect(inspector.status).toBe(200);

      // Then the UI answers the Inspector's API calls with "bad gateway"
      const res = await fetch(`${UI_ADDRESS}/api/webhooks`, { method: "POST" });
      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "bad_gateway" });
      // And the Inspector shows its error state — lib/inspector/api.ts maps any non-ok answer to
      // "network"; proven in api-ui-images.acceptance.test.ts.
    });

    it("the UI answers with bad gateway when its API resets every connection (§6a D5)", async () => {
      const network = createNetwork();
      runContainer(
        "api-reset",
        ["--network", network, "--network-alias", "website-hook-api"],
        "node:24-slim",
        ["node", "-e", "require('node:net').createServer((socket) => socket.destroy()).listen(3000)"],
      );
      startUi(network);
      await waitFor(`${UI_ADDRESS}/`);

      const res = await fetch(`${UI_ADDRESS}/api/webhooks`, { method: "POST" });

      expect(res.status).toBe(502);
      expect(await res.json()).toEqual({ error: "bad_gateway" });
    });
  });

  describe("Scenario: A caller cannot fake its address through the UI", () => {
    afterEach(removeAll);

    it("the API refuses the webhook because the caller's own quota is used", async () => {
      // Given the per-IP quota allows 1 webhook per caller
      await startLinkedUi({ WEBHOOK_QUOTA: "1", DISABLE_WEBHOOK_QUOTA: "false" });
      // And the caller already owns 1 webhook (the socket address the UI sees stands in for
      // "203.0.113.7"; the literal address is proven at the forwarder seam)
      const first = await fetch(`${UI_ADDRESS}/api/webhooks`, { method: "POST" });
      expect(first.status).toBe(201);

      // When the same caller asks the UI for another webhook while claiming address "198.51.100.9"
      const second = await fetch(`${UI_ADDRESS}/api/webhooks`, {
        method: "POST",
        headers: { "x-forwarded-for": "198.51.100.9", "x-real-ip": "198.51.100.9" },
      });

      // Then the API refuses the webhook because the caller's quota is used
      expect(second.status).toBe(429);
      expect(await second.json()).toEqual({ error: "quota_exceeded" });
    });
  });
});
