import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";

function jsonRes(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

// ApiResult is a discriminated union; this casts the failure branch out for assertions.
const errOf = (r: api.ApiResult<unknown>): api.ApiFailure =>
  (r as { ok: false; error: api.ApiFailure }).error;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("createWebhook", () => {
  it("returns the created webhook on 200", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes({ id: "w1", url: "/w1", createdAt: 1, expiresAt: 2 }),
    );
    const result = await api.createWebhook();
    expect(result).toEqual({
      ok: true,
      value: { id: "w1", url: "/w1", createdAt: 1, expiresAt: 2 },
    });
    expect(fetchMock).toHaveBeenCalledWith("/api/webhooks", { method: "POST" });
  });

  it("returns rate_limited on 429", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 429 }));
    expect(errOf(await api.createWebhook())).toBe("rate_limited");
  });

  it("returns network on a non-429 non-ok status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.createWebhook())).toBe("network");
  });

  it("returns network when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(errOf(await api.createWebhook())).toBe("network");
  });
});

describe("getWebhook", () => {
  it("returns gone on 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(errOf(await api.getWebhook("w1"))).toBe("gone");
  });

  it("returns the summary on 200 and url-encodes the id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes({ id: "w1", createdAt: 1, lastActivityAt: 2, requestCount: 3, expiresAt: 4 }),
    );
    const result = await api.getWebhook("w/1");
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/webhooks/w%2F1");
  });
});

describe("deleteWebhook", () => {
  it("is idempotent: 204 and 404 both resolve ok", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));
    expect((await api.deleteWebhook("w1")).ok).toBe(true);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect((await api.deleteWebhook("w1")).ok).toBe(true);
  });

  it("returns network on other non-ok statuses", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.deleteWebhook("w1"))).toBe("network");
  });
});

describe("listRequests", () => {
  it("appends limit and cursor to the query and encodes the webhook id", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonRes({ items: [], nextCursor: null }),
    );
    await api.listRequests("w 1", "cur", 20);
    const called = fetchMock.mock.calls[0][0] as string;
    expect(called).toContain("/api/webhooks/w%201/requests?");
    expect(called).toContain("limit=20");
    expect(called).toContain("cursor=cur");
  });

  it("omits the cursor when null", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ items: [], nextCursor: null }));
    await api.listRequests("w1", null, 20);
    expect(fetchMock.mock.calls[0][0] as string).not.toContain("cursor");
  });

  it("returns gone on 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(errOf(await api.listRequests("w1", null, 20))).toBe("gone");
  });
});

describe("getRequest", () => {
  it("returns the request on 200 and encodes both ids", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ id: "r1", method: "GET", path: "/", query: "", headers: {}, body: "", truncated: false, createdAt: 0 }));
    await api.getRequest("w1", "r1");
    expect(fetchMock.mock.calls[0][0] as string).toBe("/api/webhooks/w1/requests/r1");
  });

  it("returns gone on 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(errOf(await api.getRequest("w1", "r1"))).toBe("gone");
  });

  it("returns network on a non-404 error status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.getRequest("w1", "r1"))).toBe("network");
  });

  it("returns network when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(errOf(await api.getRequest("w1", "r1"))).toBe("network");
  });
});

describe("api — remaining failure paths", () => {
  it("getWebhook returns network on a non-404 error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.getWebhook("w1"))).toBe("network");
  });

  it("listRequests returns network on a non-404 error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.listRequests("w1", null, 20))).toBe("network");
  });

  it("listRequests returns network when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(errOf(await api.listRequests("w1", null, 20))).toBe("network");
  });
});