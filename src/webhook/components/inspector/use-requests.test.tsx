// @vitest-environment happy-dom
import "@/test/component-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import * as api from "@/lib/inspector/api";
import type { CapturedRequest, RequestPage } from "@/lib/inspector/api";
import { POLL_INTERVAL_MS } from "@/lib/constants";
import { useRequests } from "./use-requests";

vi.mock("@/lib/inspector/api");

const item = (id: string, overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id,
  method: "POST",
  path: "/o/1",
  query: "",
  headers: {},
  body: "",
  truncated: false,
  createdAt: 0,
  ...overrides,
});

const listRequests = vi.mocked(api.listRequests);

const renderReq = (opts: Parameters<typeof useRequests>[0]) =>
  renderHook(({ o }) => useRequests(o), { initialProps: { o: opts } });

// Flush the async load chain (microtasks + React updates) without waitFor, which does not
// advance under fake timers. Caps the loop so a missing mock fails fast instead of hanging.
async function flush(pred: () => boolean, n = 50) {
  for (let i = 0; i < n && !pred(); i++) {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  expect(pred(), "flush predicate never satisfied").toBe(true);
}

beforeEach(() => {
  listRequests.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("useRequests — initial load and polling", () => {
  it("loads the first page on mount and exposes items", async () => {
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a"), item("b")], nextCursor: "cur" } as RequestPage });
    const { result } = renderReq({ webhookId: "w1" });
    await flush(() => result.current.requests.length === 2);
    expect(result.current.requests.map((r) => r.id)).toEqual(["a", "b"]);
    expect(result.current.nextCursor).toBe("cur");
  });

  it("marks rows that arrived on a poll as fresh and notifies onNewRequests", async () => {
    vi.useFakeTimers();
    const onNewRequests = vi.fn();
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a")], nextCursor: null } });
    const { result } = renderReq({ webhookId: "w1", onNewRequests });
    await flush(() => result.current.requests.length === 1);
    // The server returns newest-first, so "b" heads the page and is the newly-arrived row.
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("b"), item("a")], nextCursor: null } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    await flush(() => result.current.requests.length === 2);
    expect(result.current.requests.map((r) => r.id)).toEqual(["b", "a"]);
    expect(result.current.requests.find((r) => r.id === "b")?.fresh).toBe(true);
    expect(result.current.requests.find((r) => r.id === "a")?.fresh).toBeUndefined();
    expect(onNewRequests).toHaveBeenCalledWith("w1");
  });

  it("does not notify when a poll brings nothing new", async () => {
    vi.useFakeTimers();
    const onNewRequests = vi.fn();
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a")], nextCursor: null } });
    const { result } = renderReq({ webhookId: "w1", onNewRequests });
    await flush(() => result.current.requests.length === 1);
    expect(onNewRequests).not.toHaveBeenCalled();
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a")], nextCursor: null } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(onNewRequests).not.toHaveBeenCalled();
    expect(result.current.requests.map((r) => r.id)).toEqual(["a"]);
  });
});

describe("useRequests — older pages append in order", () => {
  it("appends unseen items from the next page in order, advancing the cursor", async () => {
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a")], nextCursor: "cur" } });
    const { result } = renderReq({ webhookId: "w1" });
    await flush(() => result.current.requests.length === 1);
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("b"), item("c")], nextCursor: null } });
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(result.current.requests.map((r) => r.id)).toEqual(["a", "b", "c"]);
    expect(result.current.nextCursor).toBeNull();
    expect(result.current.loadingOlder).toBe(false);
  });

  it("does nothing when there is no cursor to load", async () => {
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a")], nextCursor: null } });
    const { result } = renderReq({ webhookId: "w1" });
    await flush(() => result.current.requests.length === 1);
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(listRequests).toHaveBeenCalledTimes(1); // initial load only
  });
});

describe("useRequests — gone handling", () => {
  it("calls onGone when the server 404s the webhook", async () => {
    const onGone = vi.fn();
    listRequests.mockResolvedValueOnce({ ok: false, error: "gone" });
    renderReq({ webhookId: "w1", onGone });
    await flush(() => onGone.mock.calls.length === 1);
    expect(onGone).toHaveBeenCalledWith("w1");
  });

  it("calls onGone when loadOlder hits a 404", async () => {
    const onGone = vi.fn();
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a")], nextCursor: "cur" } });
    const { result } = renderReq({ webhookId: "w1", onGone });
    await flush(() => result.current.requests.length === 1);
    listRequests.mockResolvedValueOnce({ ok: false, error: "gone" });
    await act(async () => {
      await result.current.loadOlder();
    });
    expect(onGone).toHaveBeenCalledWith("w1");
  });
});

describe("useRequests — refresh", () => {
  it("refresh re-runs the first page", async () => {
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a")], nextCursor: null } });
    const { result } = renderReq({ webhookId: "w1" });
    await flush(() => result.current.requests.length === 1);
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("b")], nextCursor: null } });
    await act(async () => {
      await result.current.refresh();
    });
    expect(result.current.requests.map((r) => r.id)).toEqual(["b"]);
  });
});