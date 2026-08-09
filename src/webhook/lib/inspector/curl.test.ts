import { describe, expect, it } from "vitest";
import { buildCurl } from "./curl";
import type { CapturedRequest } from "./api";

const req = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: "abc12345-6789",
  method: "POST",
  path: "/orders/9182",
  query: "",
  headers: {},
  body: "",
  truncated: false,
  createdAt: 0,
  ...overrides,
});

describe("buildCurl", () => {
  it("emits the contract shape: method UNquoted, url quoted", () => {
    const out = buildCurl(req(), "https://hook.example", "wh-1");
    expect(out.startsWith("curl -X POST 'https://hook.example/wh-1/orders/9182'")).toBe(true);
  });

  it("appends the query string when present", () => {
    const out = buildCurl(req({ query: "a=1&b=2" }), "https://hook.example", "wh-1");
    expect(out).toContain("'https://hook.example/wh-1/orders/9182?a=1&b=2'");
  });

  it("emits a -H line for each kept header, dropping host and content-length", () => {
    const out = buildCurl(
      req({
        headers: {
          host: "hook.example",
          "content-length": "42",
          "content-type": "application/json",
          "x-custom": "value",
        },
      }),
      "https://hook.example",
      "wh-1",
    );
    expect(out).toContain("-H 'content-type: application/json'");
    expect(out).toContain("-H 'x-custom: value'");
    expect(out).not.toContain("host");
    expect(out).not.toContain("content-length");
  });

  it("includes --data-raw with the decoded body when present", () => {
    const out = buildCurl(
      req({ body: Buffer.from('{"status":"shipped"}', "utf-8").toString("base64") }),
      "https://hook.example",
      "wh-1",
    );
    expect(out).toContain("--data-raw '{\"status\":\"shipped\"}'");
  });

  it("omits the --data-raw line when the body is empty or binary", () => {
    const out = buildCurl(req(), "https://hook.example", "wh-1");
    expect(out).not.toContain("--data-raw");
  });

  it("escapes single quotes inside any interpolated value so nothing breaks out", () => {
    const hostile = "a'b'c<script>alert(1)</script>";
    const out = buildCurl(
      req({
        path: "/p'q",
        headers: { "x-evil": hostile },
        body: Buffer.from(hostile, "utf-8").toString("base64"),
      }),
      "https://hook.example",
      "wh-1",
    );
    // Every embedded single quote is escaped as '\'' so the hostile value cannot break
    // out of its shell-quoted argument. Assert the escaped form is present and the raw
    // unescaped value (the regression shape — quotes interpolated bare, closing the
    // argument early) is absent. A blanket "no lone quote" guard is unsatisfiable here:
    // every correctly-quoted argument's opening quote has a non-quote on both sides.
    expect(out).toContain(`a'\\''b'\\''c<script>alert(1)</script>`);
    expect(out).not.toContain(`a'b'c<script>alert(1)</script>`);
  });

  it("renders a hostile header value and body as inert text inside quotes (no breakout)", () => {
    const payload = "<script>alert(1)</script>";
    const out = buildCurl(
      req({
        headers: { "x-markup": payload },
        body: Buffer.from(payload, "utf-8").toString("base64"),
      }),
      "https://hook.example",
      "wh-1",
    );
    expect(out).toContain(`-H 'x-markup: <script>alert(1)</script>'`);
    expect(out).toContain(`--data-raw '<script>alert(1)</script>'`);
  });
});