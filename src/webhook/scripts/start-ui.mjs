// UI image entry point (DRK-2086 §3 row 6): validates WEBHOOK_API_URL, runs the Next standalone
// server on 127.0.0.1:3001 and serves PORT, sending UI paths to Next and everything else to the API.
// Acceptance-test stubs only — the Build sub-task implements every function below.
import { pathToFileURL } from "node:url";

/**
 * Validates the API address setting (spec §3a): absolute `http`/`https` URL, at most 2048 characters.
 * @param {string | undefined} raw value of `WEBHOOK_API_URL`
 * @returns {URL} the parsed address
 * @throws {Error} naming `WEBHOOK_API_URL` when the value is missing or invalid
 */
export function parseApiUrl(raw) {
  void raw;
  throw new Error("not implemented: parseApiUrl (DRK-2086)");
}

/**
 * Whether a request path is served by the UI itself (rule R1): exactly `/`, `/status` and `/_next/*`.
 * @param {string} pathname
 * @returns {boolean}
 */
export function isUiPath(pathname) {
  void pathname;
  throw new Error("not implemented: isUiPath (DRK-2086)");
}

/**
 * Headers for a call forwarded to the API (rule R3).
 * @param {import("node:http").IncomingHttpHeaders} headers the caller's headers
 * @param {string} remoteAddress the caller's socket address
 * @returns {import("node:http").OutgoingHttpHeaders}
 */
export function forwardHeaders(headers, remoteAddress) {
  void headers;
  void remoteAddress;
  throw new Error("not implemented: forwardHeaders (DRK-2086)");
}

function main() {
  throw new Error("not implemented: start-ui (DRK-2086)");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
