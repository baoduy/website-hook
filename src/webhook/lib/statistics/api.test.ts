import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "./api";

function jsonRes(body: unknown, init: { status?: number } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "content-type": "application/json" },
  });
}

const errOf = (r: api.ApiResult<unknown>): api.ApiFailure => (r as { ok: false; error: api.ApiFailure }).error;

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchMock = vi.fn();
  global.fetch = fetchMock as unknown as typeof fetch;
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe("getTraffic", () => {
  it("requests the chosen window and returns the traffic payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ window: "7d", totalRequests: 630 }));
    const result = await api.getTraffic("7d");
    expect(result).toEqual({ ok: true, value: { window: "7d", totalRequests: 630 } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/statistics/traffic?window=7d");
  });

  it("returns network on a non-ok status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.getTraffic("24h"))).toBe("network");
  });

  it("returns network when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(errOf(await api.getTraffic("24h"))).toBe("network");
  });
});

describe("getStorage", () => {
  it("returns the storage payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ webhooks: 26, capturedRequests: 4310 }));
    expect(await api.getStorage()).toEqual({ ok: true, value: { webhooks: 26, capturedRequests: 4310 } });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/statistics/storage");
  });

  it("returns network when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(errOf(await api.getStorage())).toBe("network");
  });
});

describe("listWebhooks", () => {
  it("omits the query when empty and encodes a non-empty filter", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ items: [] }));
    await api.listWebhooks("");
    expect(fetchMock.mock.calls[0][0]).toBe("/api/statistics/webhooks");

    fetchMock.mockResolvedValueOnce(jsonRes({ items: [] }));
    await api.listWebhooks("stripe/events");
    expect(fetchMock.mock.calls[1][0]).toBe("/api/statistics/webhooks?q=stripe%2Fevents");
  });

  it("returns network on a non-ok status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.listWebhooks(""))).toBe("network");
  });
});

describe("listWebhookRequests", () => {
  it("encodes the id and limit and returns the recent-requests payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ total: 148, items: [] }));
    const result = await api.listWebhookRequests("w 1", 5);
    expect(result.ok).toBe(true);
    expect(fetchMock.mock.calls[0][0]).toBe("/api/statistics/webhooks/w%201/requests?limit=5");
  });

  it("returns not_found on 404", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(errOf(await api.listWebhookRequests("nope", 5))).toBe("not_found");
  });

  it("returns network on a non-404 error", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.listWebhookRequests("w1", 5))).toBe("network");
  });
});

describe("previewCleanup", () => {
  it("returns the cleanup preview payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12 }));
    expect(await api.previewCleanup()).toEqual({
      ok: true,
      value: { webhooks: [{ id: "7b19aa03", requestCount: 12 }], totalRequests: 12 },
    });
    expect(fetchMock.mock.calls[0][0]).toBe("/api/statistics/cleanup");
  });

  it("returns network when fetch throws", async () => {
    fetchMock.mockRejectedValueOnce(new Error("offline"));
    expect(errOf(await api.previewCleanup())).toBe("network");
  });
});

describe("runCleanup", () => {
  it("sends a DELETE and returns the cleanup result payload", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ deletedWebhooks: 1, deletedRequests: 12 }));
    expect(await api.runCleanup()).toEqual({ ok: true, value: { deletedWebhooks: 1, deletedRequests: 12 } });
    expect(fetchMock).toHaveBeenCalledWith("/api/statistics/cleanup", { method: "DELETE" });
  });

  it("returns network on a non-ok status", async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 500 }));
    expect(errOf(await api.runCleanup())).toBe("network");
  });
});
