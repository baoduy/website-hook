import { afterEach, describe, expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import http from "node:http";
import net from "node:net";
import type { AddressInfo } from "node:net";
import { createForwarder, main } from "./start-ui.mjs";

// The internal Next server is a child process; main()'s tests replace it with an event emitter.
const spawn = vi.hoisted(() => vi.fn());
vi.mock("node:child_process", () => ({ spawn }));

// The UI forwarder's HTTP behaviour (DRK-2086 rules R1, R3, R6 and §6a D5) against real local
// servers standing in for the API and the internal Next server.

type Seen = { method?: string; url?: string; headers: http.IncomingHttpHeaders; body: string };

const servers: net.Server[] = [];

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  spawn.mockReset();
  await Promise.all(
    servers.splice(0).map((server) => new Promise((resolve) => server.close(resolve))),
  );
});

async function listen<T extends net.Server>(server: T): Promise<T & { port: number }> {
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  return Object.assign(server, { port: (server.address() as AddressInfo).port });
}

/** An upstream that records the call it received and answers `status` with `name` as body. */
async function recordingUpstream(name: string, status = 200) {
  const seen: Seen[] = [];
  const server = await listen(
    http.createServer((req, res) => {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        seen.push({ method: req.method, url: req.url, headers: req.headers, body });
        res.writeHead(status, { "content-type": "text/plain", "x-upstream": name });
        res.end(name);
      });
    }),
  );
  return { seen, port: server.port };
}

async function startForwarder(apiUrl: string, nextUrl = "http://127.0.0.1:1", timeoutMs?: number) {
  const forwarder = await listen(createForwarder(new URL(apiUrl), new URL(nextUrl), timeoutMs));
  return `http://127.0.0.1:${forwarder.port}`;
}

/** A port nothing listens on: bound once, then closed. */
async function closedPort() {
  const server = net.createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  await new Promise((resolve) => server.close(resolve));
  return port;
}

describe("createForwarder — routing (R1, R6)", () => {
  it("sends the UI pages to Next and every other call to the API", async () => {
    const api = await recordingUpstream("api");
    const next = await recordingUpstream("next");
    const ui = await startForwarder(`http://127.0.0.1:${api.port}`, `http://127.0.0.1:${next.port}`);

    const page = await fetch(`${ui}/status`);
    const call = await fetch(`${ui}/api/webhooks`);

    expect(await page.text()).toBe("next");
    expect(await call.text()).toBe("api");
    expect(next.seen.map((s) => s.url)).toEqual(["/status"]);
    expect(api.seen.map((s) => s.url)).toEqual(["/api/webhooks"]);
  });

  it("keeps the API address's path as a prefix of the forwarded path and query", async () => {
    const api = await recordingUpstream("api");
    const ui = await startForwarder(`http://127.0.0.1:${api.port}/hooks/`);

    await fetch(`${ui}/api/webhooks?x=1`);

    expect(api.seen[0].url).toBe("/hooks/api/webhooks?x=1");
  });

  it("never lets the request pick the target: an absolute-form request goes to the API's own address (R2)", async () => {
    const api = await recordingUpstream("api");
    const ui = new URL(await startForwarder(`http://127.0.0.1:${api.port}`));

    const answer = await new Promise<string>((resolve) => {
      const socket = net.connect(Number(ui.port), ui.hostname, () =>
        socket.write("GET http://evil.example/api/webhooks?x=1 HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n"),
      );
      let received = "";
      socket.on("data", (chunk) => (received += chunk));
      socket.on("close", () => resolve(received));
    });

    expect(answer.split("\r\n")[0]).toBe("HTTP/1.1 200 OK");
    expect(api.seen.map((s) => s.url)).toEqual(["/api/webhooks?x=1"]);
  });

  it("forwards method, body and caller host unchanged and relays the API's answer", async () => {
    const api = await recordingUpstream("api", 201);
    const ui = await startForwarder(`http://127.0.0.1:${api.port}`);

    const res = await fetch(`${ui}/7f3c2a10-0000-4000-8000-000000000001/orders`, {
      method: "PUT",
      headers: { "x-forwarded-for": "198.51.100.9" },
      body: '{"orderId":"ord-1001"}',
    });

    expect(res.status).toBe(201);
    expect(res.headers.get("x-upstream")).toBe("api");
    expect(api.seen[0]).toMatchObject({ method: "PUT", body: '{"orderId":"ord-1001"}' });
    expect(api.seen[0].headers.host).toBe(new URL(ui).host);
    expect(api.seen[0].headers["x-forwarded-for"]).toMatch(/^(::ffff:)?127\.0\.0\.1$/);
  });
});

describe("createForwarder — an unreachable API answers bad gateway (D5)", () => {
  async function expectBadGateway(res: Response) {
    expect(res.status).toBe(502);
    expect(res.headers.get("content-type")).toBe("application/json");
    expect(await res.json()).toEqual({ error: "bad_gateway" });
  }

  it("when the API refuses the connection", async () => {
    const ui = await startForwarder(`http://127.0.0.1:${await closedPort()}`);

    await expectBadGateway(await fetch(`${ui}/api/webhooks`, { method: "POST" }));
  });

  it("when the API resets the connection", async () => {
    const api = await listen(net.createServer((socket) => socket.destroy()));
    const ui = await startForwarder(`http://127.0.0.1:${api.port}`);

    await expectBadGateway(await fetch(`${ui}/api/webhooks`, { method: "POST" }));
  });

  it("when the API does not answer in time", async () => {
    const api = await listen(http.createServer(() => {}));
    const ui = await startForwarder(`http://127.0.0.1:${api.port}`, undefined, 50);

    await expectBadGateway(await fetch(`${ui}/api/webhooks`, { method: "POST" }));
  });

  it.each(["127.0.0.1", "localhost"])("when an https API address on %s does not speak TLS", async (host) => {
    const api = await recordingUpstream("api");
    const ui = await startForwarder(`https://${host}:${api.port}`);

    await expectBadGateway(await fetch(`${ui}/api/webhooks`));
    expect(api.seen).toEqual([]);
  });

  it("cuts the caller's response when the API resets the connection midway", async () => {
    const api = await listen(
      http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("partial", () => res.socket?.destroy());
      }),
    );
    const ui = await startForwarder(`http://127.0.0.1:${api.port}`);

    const res = await fetch(`${ui}/api/webhooks`);

    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow();
  });

  it("cuts the caller's response when the API stops answering midway", async () => {
    const api = await listen(
      http.createServer((_req, res) => {
        res.writeHead(200, { "content-type": "text/plain" });
        res.write("partial");
      }),
    );
    const ui = await startForwarder(`http://127.0.0.1:${api.port}`, undefined, 50);

    const res = await fetch(`${ui}/api/webhooks`);

    expect(res.status).toBe(200);
    await expect(res.text()).rejects.toThrow();
  });
});

describe("createForwarder — a caller that hangs up", () => {
  it("abandons the API call it was forwarding", async () => {
    let apiCallClosed: () => void;
    const closed = new Promise<void>((resolve) => (apiCallClosed = resolve));
    const api = await listen(
      http.createServer((req) => {
        req.on("close", () => apiCallClosed());
        socket.destroy();
      }),
    );
    const ui = new URL(await startForwarder(`http://127.0.0.1:${api.port}`));
    const socket = net.connect(Number(ui.port), ui.hostname, () =>
      socket.write("POST /api/webhooks HTTP/1.1\r\nHost: localhost\r\nContent-Length: 100\r\n\r\npartial"),
    );

    await closed;
  });
});

describe("main — starting the UI", () => {
  function stubExit() {
    return vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
  }

  it("refuses a bad API address before starting anything, naming WEBHOOK_API_URL (R4)", () => {
    vi.stubEnv("WEBHOOK_API_URL", "website-hook-api:3000");
    const exit = stubExit();
    const stderr = vi.spyOn(console, "error").mockImplementation(() => {});

    const server = main();

    expect(exit).toHaveBeenCalledWith(1);
    expect(stderr.mock.calls[0][0]).toMatch(/^WEBHOOK_API_URL /);
    expect(spawn).not.toHaveBeenCalled();
    expect(server).toBeUndefined();
  });

  it("runs Next on 127.0.0.1:3001, serves PORT and exits with Next's exit code", async () => {
    vi.stubEnv("WEBHOOK_API_URL", "http://website-hook-api:3000");
    vi.stubEnv("PORT", "0");
    const next = new EventEmitter();
    spawn.mockReturnValue(next);
    const exit = stubExit();

    const server = await listening(main()!);

    expect(spawn).toHaveBeenCalledWith(
      "node",
      ["server.js"],
      expect.objectContaining({ stdio: "inherit", env: expect.objectContaining({ HOSTNAME: "127.0.0.1", PORT: "3001" }) }),
    );
    expect(server.listening).toBe(true);
    next.emit("exit", 3, null);
    next.emit("exit", null, "SIGTERM");
    next.emit("exit", null, null);
    expect(exit.mock.calls).toEqual([[3], [1], [0]]);
  });
});

async function listening(server: http.Server) {
  servers.push(server);
  if (!server.listening) await new Promise((resolve) => server.once("listening", resolve));
  return server;
}
