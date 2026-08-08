/* @vitest-environment happy-dom */
import "@/test/component-setup";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import * as api from "@/lib/inspector/api";
import { MAX_REMEMBERED_WEBHOOKS, STORAGE_KEY } from "@/lib/constants";
import { useWebhooks } from "./use-webhooks";

vi.mock("@/lib/inspector/api");

const createWebhook = vi.mocked(api.createWebhook);
const getWebhook = vi.mocked(api.getWebhook);
const deleteWebhook = vi.mocked(api.deleteWebhook);

function seedIds(ids: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

beforeEach(() => {
  window.localStorage.clear();
  createWebhook.mockReset();
  getWebhook.mockReset();
  deleteWebhook.mockReset();
});

const summary = (id: string) => ({
  id,
  createdAt: 1000,
  lastActivityAt: 2000,
  requestCount: 7,
  expiresAt: 9999999999999,
});

describe("useWebhooks — hydration", () => {
  it("hydrates remembered ids from localStorage, fetching each summary", async () => {
    seedIds(["a", "b"]);
    getWebhook.mockImplementation(async (id) => ({ ok: true, value: summary(id) }));
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(2));
    expect(getWebhook).toHaveBeenCalledWith("a");
    expect(getWebhook).toHaveBeenCalledWith("b");
  });

  it("starts empty when nothing is remembered", async () => {
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.webhooks).toEqual([]);
  });
});

describe("useWebhooks — create and the five-at-a-time cap", () => {
  it("creates a webhook, prepends it, selects it and persists the id", async () => {
    getWebhook.mockResolvedValue({ ok: true, value: summary("old") });
    seedIds(["old"]);
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(1));
    createWebhook.mockResolvedValueOnce({
      ok: true,
      value: { id: "new", url: "/new", createdAt: 5, expiresAt: 6 },
    });
    let outcome;
    await act(async () => {
      outcome = await result.current.create();
    });
    expect(outcome).toBe("created");
    expect(result.current.webhooks.map((w) => w.id)).toEqual(["new", "old"]);
    expect(result.current.selectedId).toBe("new");
    const stored = JSON.parse(window.localStorage.getItem(STORAGE_KEY)!);
    expect(stored).toEqual(["new", "old"]);
  });

  it("refuses at the cap with at_cap", async () => {
    seedIds(["w1", "w2", "w3", "w4", "w5"]);
    getWebhook.mockResolvedValue({ ok: true, value: summary("x") });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(MAX_REMEMBERED_WEBHOOKS));
    expect(result.current.atCap).toBe(true);
    let outcome;
    await act(async () => {
      outcome = await result.current.create();
    });
    expect(outcome).toBe("at_cap");
    expect(createWebhook).not.toHaveBeenCalled();
  });

  it("concurrent create attempts: a second call while one is in-flight is rejected by the creating guard", async () => {
    seedIds(["w1", "w2", "w3", "w4"]);
    getWebhook.mockResolvedValue({ ok: true, value: summary("x") });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(4));
    // The first create never resolves, so `creating` stays true and the guard is what the
    // second call must hit — exactly the double-click race the guard exists for.
    createWebhook.mockImplementation(() => new Promise<api.ApiResult<api.CreatedWebhook>>(() => {}));
    await act(async () => {
      result.current.create();
    });
    await waitFor(() => expect(result.current.creating).toBe(true));
    let o2: string;
    await act(async () => {
      o2 = await result.current.create();
    });
    expect(o2!).toBe("failed");
  });

  it("surfaces rate_limited from a 429", async () => {
    createWebhook.mockResolvedValueOnce({ ok: false, error: "rate_limited" });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let outcome;
    await act(async () => {
      outcome = await result.current.create();
    });
    expect(outcome).toBe("rate_limited");
  });

  it("surfaces failed on a network error", async () => {
    createWebhook.mockResolvedValueOnce({ ok: false, error: "network" });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.loading).toBe(false));
    let outcome;
    await act(async () => {
      outcome = await result.current.create();
    });
    expect(outcome).toBe("failed");
  });
});

describe("useWebhooks — remove, forget, clear", () => {
  it("remove deletes server-side then forgets locally and frees a slot", async () => {
    seedIds(["a", "b"]);
    getWebhook.mockResolvedValue({ ok: true, value: summary("x") });
    deleteWebhook.mockResolvedValue({ ok: true, value: null });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(2));
    await act(async () => {
      await result.current.remove("a");
    });
    expect(deleteWebhook).toHaveBeenCalledWith("a");
    expect(result.current.webhooks.map((w) => w.id)).toEqual(["b"]);
    expect(JSON.parse(window.localStorage.getItem(STORAGE_KEY)!)).toEqual(["b"]);
  });

  it("forget drops a webhook without calling the server", async () => {
    seedIds(["a", "b"]);
    getWebhook.mockResolvedValue({ ok: true, value: summary("x") });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(2));
    act(() => result.current.forget("a"));
    expect(deleteWebhook).not.toHaveBeenCalled();
    expect(result.current.webhooks.map((w) => w.id)).toEqual(["b"]);
    expect(result.current.selectedId).toBe("b");
  });

  it("clear empties the rail and the storage", async () => {
    seedIds(["a", "b"]);
    getWebhook.mockResolvedValue({ ok: true, value: summary("x") });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(2));
    act(() => result.current.clear());
    expect(result.current.webhooks).toEqual([]);
    expect(window.localStorage.getItem(STORAGE_KEY)).toBeNull();
  });
});

describe("useWebhooks — expired/deleted handling", () => {
  it("marks a 404 webhook as gone but keeps the row", async () => {
    seedIds(["gone", "ok"]);
    getWebhook.mockImplementation(async (id) =>
      id === "gone" ? { ok: false, error: "gone" } : { ok: true, value: summary(id) },
    );
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(2));
    const gone = result.current.webhooks.find((w) => w.id === "gone");
    expect(gone?.gone).toBe(true);
    expect(gone?.summary).toBeNull();
  });

  it("a network blip leaves the row intact and not gone", async () => {
    seedIds(["flaky"]);
    getWebhook.mockResolvedValue({ ok: false, error: "network" });
    const { result } = renderHook(() => useWebhooks());
    await waitFor(() => expect(result.current.webhooks).toHaveLength(1));
    expect(result.current.webhooks[0].gone).toBe(false);
    expect(result.current.webhooks[0].summary).toBeNull();
  });
});