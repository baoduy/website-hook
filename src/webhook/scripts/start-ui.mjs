// UI image entry point (DRK-2086 §3 row 6): validates WEBHOOK_API_URL, runs the Next standalone
// server on 127.0.0.1:3001 and serves PORT, sending UI paths to Next and everything else to the API.
import { spawn } from "node:child_process";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { pathToFileURL } from "node:url";

const API_URL_MAX_LENGTH = 2048;
const NEXT_PORT = 3001;
// ponytail: one fixed upstream timeout; make it a setting if a slow API ever needs longer.
const UPSTREAM_TIMEOUT_MS = 30_000;
// x-forwarded-for is not listed: forwardHeaders overwrites it with the socket address.
const CALLER_ADDRESS_HEADERS = new Set(["x-real-ip", "forwarded"]);

/**
 * Validates the API address setting (spec §3a): absolute `http`/`https` URL, at most 2048 characters.
 * @param {string | undefined} raw value of `WEBHOOK_API_URL`
 * @returns {URL} the parsed address
 * @throws {Error} naming `WEBHOOK_API_URL` when the value is missing or invalid
 */
export function parseApiUrl(raw) {
  const url = raw && raw.length <= API_URL_MAX_LENGTH ? URL.parse(raw) : null;
  if (url?.protocol !== "http:" && url?.protocol !== "https:") {
    throw new Error(
      `WEBHOOK_API_URL must be an absolute http or https URL of at most ${API_URL_MAX_LENGTH} characters`,
    );
  }
  return url;
}

/**
 * Whether a request path is served by the UI itself (rule R1): exactly `/`, `/status` and `/_next/*`.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isUiPath(pathname) {
  return pathname === "/" || pathname === "/status" || pathname.startsWith("/_next/");
}

/**
 * Headers for a call forwarded to the API (rule R3).
 * @param {import("node:http").IncomingHttpHeaders} headers the caller's headers
 * @param {string} remoteAddress the caller's socket address
 * @returns {import("node:http").OutgoingHttpHeaders}
 */
export function forwardHeaders(headers, remoteAddress) {
  const forwarded = Object.fromEntries(
    Object.entries(headers).filter(([name]) => !CALLER_ADDRESS_HEADERS.has(name)),
  );
  forwarded["x-forwarded-proto"] = headers["x-forwarded-proto"] ?? "http";
  forwarded["x-forwarded-for"] = remoteAddress;
  return forwarded;
}

/** The base every forwarded path is appended to: origin plus the address's path, no trailing slash (rule R6). */
function baseOf(url) {
  return url.origin + url.pathname.replace(/\/$/, "");
}

function badGateway(res) {
  if (res.headersSent) {
    res.destroy();
    return;
  }
  res.writeHead(502, { "content-type": "application/json" });
  res.end(JSON.stringify({ error: "bad_gateway" }));
}

/**
 * The UI's HTTP server: UI paths go to Next on `nextUrl`, every other call goes to `apiUrl` (rules R1, R2, R6).
 * Only the two configured addresses are ever called; no request value picks the target.
 * @param {URL} apiUrl the validated `WEBHOOK_API_URL`
 * @param {URL} nextUrl the internal Next server
 * @param {number} [timeoutMs] idle time after which an upstream call answers bad gateway
 * @returns {import("node:http").Server}
 */
export function createForwarder(apiUrl, nextUrl, timeoutMs = UPSTREAM_TIMEOUT_MS) {
  return http.createServer((req, res) => {
    // Only the path and query are taken from the request, even from an absolute-form target (rule R2).
    const { pathname, search } = new URL(req.url, "http://localhost");
    const upstream = isUiPath(pathname) ? nextUrl : apiUrl;
    const client = upstream.protocol === "https:" ? https : http;
    const outgoing = client.request(
      baseOf(upstream) + pathname + search,
      {
        method: req.method,
        headers: forwardHeaders(req.headers, req.socket.remoteAddress ?? ""),
        // TLS names the configured API host, not the caller's host header the request carries;
        // an IP address carries no server name (Node refuses one).
        servername: isIP(upstream.hostname.replace(/^\[(.*)\]$/, "$1")) ? "" : upstream.hostname,
      },
      (incoming) => {
        res.writeHead(incoming.statusCode, incoming.headers);
        incoming.on("error", () => res.destroy());
        incoming.pipe(res);
      },
    );
    outgoing.setTimeout(timeoutMs, () => outgoing.destroy(new Error("upstream timeout")));
    outgoing.on("error", () => badGateway(res));
    req.on("error", () => outgoing.destroy());
    req.pipe(outgoing);
  });
}

/**
 * Starts the UI: refuses a bad `WEBHOOK_API_URL` before listening (rule R4), runs Next on 127.0.0.1:3001,
 * exits with Next's exit code, and serves `PORT` (default 3000).
 * @returns {import("node:http").Server | undefined} the listening forwarder
 */
export function main() {
  let apiUrl;
  try {
    apiUrl = parseApiUrl(process.env.WEBHOOK_API_URL);
  } catch (error) {
    console.error(error.message);
    return process.exit(1);
  }

  const next = spawn("node", ["server.js"], {
    stdio: "inherit",
    env: { ...process.env, HOSTNAME: "127.0.0.1", PORT: String(NEXT_PORT) },
  });
  next.on("exit", (code, signal) => {
    process.exit(code ?? (signal ? 1 : 0));
  });

  return createForwarder(apiUrl, new URL(`http://127.0.0.1:${NEXT_PORT}`)).listen(Number(process.env.PORT ?? 3000));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
