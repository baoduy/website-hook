import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { getClientIp, notFound, readBoundedBody, serializeCapturedRequest, serializeWebhook } from "./http";

describe("notFound", () => {
  it("responds 404 with the shared not_found error body", async () => {
    const res = notFound();
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: "not_found" });
  });
});

describe("getClientIp", () => {
  it("reads the first address from x-forwarded-for", () => {
    const req = new NextRequest("http://localhost/", { headers: { "x-forwarded-for": "9.9.9.9, 10.0.0.1" } });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to a shared bucket when no proxy header is present", () => {
    const req = new NextRequest("http://localhost/");
    expect(getClientIp(req)).toBe("unknown");
  });
});

describe("serializeWebhook", () => {
  it("exposes exactly the info fields the API contract promises", () => {
    const webhook = { id: "abc", createdAt: 1, lastActivityAt: 2, requestCount: 3, expiresAt: 4 };
    expect(serializeWebhook(webhook)).toEqual(webhook);
  });
});

describe("serializeCapturedRequest", () => {
  it("base64-encodes the opaque body instead of interpreting it", () => {
    const row = {
      id: "req-1",
      webhookId: "wh-1",
      createdAt: 5,
      method: "POST",
      path: "/sub",
      query: "a=b",
      headers: { "content-type": "application/json" },
      body: Buffer.from("hello"),
      truncated: false,
    };
    expect(serializeCapturedRequest(row)).toEqual({
      id: "req-1",
      method: "POST",
      path: "/sub",
      query: "a=b",
      headers: { "content-type": "application/json" },
      body: Buffer.from("hello").toString("base64"),
      truncated: false,
      createdAt: 5,
    });
  });
});

describe("readBoundedBody", () => {
  it("returns an empty, untruncated buffer when there is no body", async () => {
    const req = new Request("http://localhost/", { method: "GET" });
    const result = await readBoundedBody(req, 10);
    expect(result).toEqual({ body: Buffer.alloc(0), truncated: false });
  });

  it("keeps a body at or under the cap intact and untruncated", async () => {
    const req = new Request("http://localhost/", { method: "POST", body: "12345" });
    const result = await readBoundedBody(req, 5);
    expect(result.truncated).toBe(false);
    expect(result.body.toString()).toBe("12345");
  });

  it("truncates a body over the cap and flags it, keeping exactly maxBytes", async () => {
    const req = new Request("http://localhost/", { method: "POST", body: "1234567890" });
    const result = await readBoundedBody(req, 5);
    expect(result.truncated).toBe(true);
    expect(result.body.length).toBe(5);
    expect(result.body.toString()).toBe("12345");
  });
});
