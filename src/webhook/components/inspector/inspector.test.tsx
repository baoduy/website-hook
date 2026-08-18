// @vitest-environment happy-dom
import "@/test/component-setup";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Inspector } from "./inspector";
import * as api from "@/lib/inspector/api";
import { POLL_INTERVAL_MS, STORAGE_KEY } from "@/lib/constants";

vi.mock("@/lib/inspector/api");

const createWebhook = vi.mocked(api.createWebhook);
const getWebhook = vi.mocked(api.getWebhook);
const deleteWebhook = vi.mocked(api.deleteWebhook);
const listRequests = vi.mocked(api.listRequests);

const enc = (t: string) => Buffer.from(t, "utf-8").toString("base64");

const item = (id: string, overrides: Partial<api.CapturedRequest> = {}): api.CapturedRequest => ({
  id,
  method: "POST",
  path: `/o/${id}`,
  query: "",
  headers: {},
  body: "",
  truncated: false,
  createdAt: 1,
  ...overrides,
});

const summary = (id: string, overrides: Partial<api.WebhookSummary> = {}): api.WebhookSummary => ({
  id,
  createdAt: 1_000,
  lastActivityAt: 2_000,
  requestCount: 0,
  expiresAt: 999_999_999_999_999,
  ...overrides,
});

function seed(ids: string[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
}

// Request rows render in a button carrying the `py-[9px]` class; the path lives in its
// .truncate span. Scoping to that selector resolves the row/detail duplicate-text problem.
const rowButtons = (c: HTMLElement) => [...c.querySelectorAll<HTMLElement>('button[class*="py-[9px]"]')];
const rowPath = (row: HTMLElement) => (row.querySelector("span.truncate") as HTMLElement | null)?.textContent ?? "";
const rowPaths = (c: HTMLElement) => rowButtons(c).map(rowPath);
const rowForPath = (c: HTMLElement, path: string) => rowButtons(c).find((r) => rowPath(r) === path)!;

async function flushUntil(pred: () => boolean, n = 40) {
  for (let i = 0; i < n && !pred(); i++) {
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
  }
  expect(pred(), "flushUntil predicate never satisfied").toBe(true);
}

beforeEach(() => {
  window.localStorage.clear();
  createWebhook.mockReset();
  getWebhook.mockReset();
  deleteWebhook.mockReset();
  listRequests.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderInspector(ids: string[] = ["w1", "w2"]) {
  seed(ids);
  getWebhook.mockImplementation(async (id) => ({ ok: true, value: summary(id) }));
  return render(<Inspector />);
}

describe("Inspector integration — polling arrival and new-row marking", () => {
  it("marks rows that arrive on a poll with the fresh-row class", async () => {
    vi.useFakeTimers();
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a", { path: "/w1/a" })], nextCursor: null } });
    const { container } = await renderInspector(["w1"]);
    await flushUntil(() => rowPaths(container).includes("/w1/a"));
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a", { path: "/w1/a" }), item("b", { path: "/w1/b" })], nextCursor: null } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    await flushUntil(() => rowPaths(container).includes("/w1/b"));
    expect(rowForPath(container, "/w1/b").className).toContain("wh-row-in");
    vi.useRealTimers();
  });
});

describe("Inspector integration — older pages append in order", () => {
  it("appends older rows after the current page", async () => {
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("a", { path: "/o/a" })], nextCursor: "cur" } });
    const { container } = await renderInspector(["w1"]);
    await waitFor(() => expect(rowPaths(container)).toContain("/o/a"));
    listRequests.mockResolvedValueOnce({ ok: true, value: { items: [item("b", { path: "/o/b" }), item("c", { path: "/o/c" })], nextCursor: null } });
    fireEvent.click(screen.getByText("Load older"));
    await waitFor(() => expect(rowPaths(container)).toEqual(["/o/a", "/o/b", "/o/c"]));
  });
});

describe("Inspector integration — timer leak on webhook switch", () => {
  it("does not accumulate polling work across a webhook switch", async () => {
    vi.useFakeTimers();
    listRequests.mockImplementation(async (id) => ({ ok: true, value: { items: [item("x", { path: `/${id}/x` })], nextCursor: null } }));
    const { container } = await renderInspector(["w1", "w2"]);
    await flushUntil(() => rowPaths(container).includes("/w1/x"));

    fireEvent.click(screen.getByText("w2"));
    // w1's row must go and only w2's remain (switch replaced the page, not stacked it)
    await flushUntil(() => rowPaths(container).includes("/w2/x"));

    listRequests.mockClear();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(listRequests).toHaveBeenCalledTimes(1);
    expect(listRequests.mock.calls[0][0]).toBe("w2");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(POLL_INTERVAL_MS);
    });
    expect(listRequests).toHaveBeenCalledTimes(2);
    expect(listRequests.mock.calls.every((c) => c[0] === "w2")).toBe(true);
    vi.useRealTimers();
  });
});

describe("Inspector integration — create disabled at the cap", () => {
  it("disables the new-webhook control when five are remembered", async () => {
    listRequests.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null } });
    await renderInspector(["w1", "w2", "w3", "w4", "w5"]);
    await waitFor(() => expect(screen.getByLabelText("New webhook")).toBeTruthy());
    const button = screen.getByLabelText("New webhook") as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText(/five webhooks at a time/)).toBeTruthy();
  });
});

describe("Inspector integration — create flow", () => {
  it("creates a webhook from the new-webhook control and selects it", async () => {
    listRequests.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null } });
    createWebhook.mockResolvedValueOnce({ ok: true, value: { id: "newid1234567890", url: "/newid1234567890", createdAt: 1, expiresAt: 2 } });
    await renderInspector([]);
    await waitFor(() => expect(screen.getByLabelText("New webhook")).toBeTruthy());
    fireEvent.click(screen.getByLabelText("New webhook"));
    await waitFor(() => expect(screen.getAllByText(/newid123.+7890/).length).toBeGreaterThan(0));
    expect(screen.getByText("/newid1234567890")).toBeTruthy();
  });

  it("shows the rate-limit notice when creation is rate limited", async () => {
    createWebhook.mockResolvedValueOnce({ ok: false, error: "rate_limited" });
    await renderInspector([]);
    fireEvent.click(screen.getByLabelText("New webhook"));
    await waitFor(() => expect(screen.getByText(/rate limited to 20 per minute/)).toBeTruthy());
  });

  it("shows the failure notice when the service is unreachable", async () => {
    createWebhook.mockResolvedValueOnce({ ok: false, error: "network" });
    await renderInspector([]);
    fireEvent.click(screen.getByLabelText("New webhook"));
    await waitFor(() => expect(screen.getByText(/Could not reach the service/)).toBeTruthy());
  });
});

describe("Inspector integration — confirmed delete", () => {
  it("asks for confirmation then deletes server-side and forgets locally", async () => {
    deleteWebhook.mockResolvedValue({ ok: true, value: null });
    listRequests.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null } });
    const user = userEvent.setup();
    await renderInspector(["w1", "w2"]);
    await waitFor(() => expect(screen.getByText("w1")).toBeTruthy());

    await user.click(screen.getByLabelText("Webhook actions"));
    const menuItem = await screen.findByRole("menuitem", { name: /Delete webhook/ });
    await user.click(menuItem);
    await screen.findByText("Delete this webhook?");

    const confirm = await screen.findByRole("button", { name: "Delete webhook" });
    await user.click(confirm);

    await waitFor(() => expect(deleteWebhook).toHaveBeenCalledWith("w1"));
    await waitFor(() => expect(screen.queryByText("w1")).toBeNull());
  });
});

describe("Inspector integration — search keeps a matching request selected", () => {
  it("keeps the selected request when a search still matches it, otherwise falls back to the first match", async () => {
    listRequests.mockResolvedValueOnce({
      ok: true,
      value: { items: [item("a", { body: enc('{"job":"ship"}'), path: "/o/a" }), item("b", { body: enc('{"job":"bill"}'), path: "/o/b" })], nextCursor: null },
    });
    const { container } = await renderInspector(["w1"]);
    await waitFor(() => expect(rowPaths(container)).toContain("/o/b"));

    fireEvent.click(rowForPath(container, "/o/b"));
    expect(rowForPath(container, "/o/b").getAttribute("aria-current")).toBe("true");

    fireEvent.change(screen.getByLabelText("Search path, header or body"), { target: { value: "bill" } });
    await waitFor(() => expect(screen.getByText("1 requests matched")).toBeTruthy());
    expect(rowForPath(container, "/o/b").getAttribute("aria-current")).toBe("true");

    fireEvent.change(screen.getByLabelText("Search path, header or body"), { target: { value: "nomatch" } });
    await waitFor(() => expect(screen.getByText("Nothing matches")).toBeTruthy());
    expect(screen.getByText("Select a request")).toBeTruthy();
  });
});

describe("Inspector — sidebar outbound links", () => {
  it("renders both outbound links with correct href targets", async () => {
    listRequests.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null } });
    await renderInspector(["w1"]);
    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(2));

    const gh = screen.getByRole("link", { name: "View source on GitHub" });
    expect(gh.getAttribute("href")).toBe("https://github.com/baoduy/website-hook");

    const dc = screen.getByRole("link", { name: "Visit drunkcoding.net" });
    expect(dc.getAttribute("href")).toBe("https://drunkcoding.net");
  });

  it("each link carries aria-label, title, target=_blank, and rel=noopener noreferrer", async () => {
    listRequests.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null } });
    await renderInspector(["w1"]);
    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(2));

    for (const name of ["View source on GitHub", "Visit drunkcoding.net"]) {
      const link = screen.getByRole("link", { name });
      expect(link.getAttribute("aria-label")).toBe(name);
      expect(link.getAttribute("title")).toBe(name);
      expect(link.getAttribute("target")).toBe("_blank");
      expect(link.getAttribute("rel")).toBe("noopener noreferrer");
    }
  });

  it("does not show 'Stored in this browser' text", async () => {
    listRequests.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null } });
    await renderInspector(["w1"]);
    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByText("Stored in this browser")).toBeNull();
  });

  it("has no Clear button anywhere in the sidebar", async () => {
    listRequests.mockResolvedValue({ ok: true, value: { items: [], nextCursor: null } });
    await renderInspector(["w1"]);
    await waitFor(() => expect(screen.getAllByRole("link").length).toBeGreaterThanOrEqual(2));
    expect(screen.queryByRole("button", { name: "Clear" })).toBeNull();
  });
});

describe("Inspector integration — captured markup renders inert on every surface", () => {
  it("renders a hostile header value and body as text, never as an element, and produces a safe cURL and blob", async () => {
    const markup = "<script>alert(1)</script>";
    const writeText = vi.spyOn(navigator.clipboard!, "writeText").mockResolvedValue(undefined);
    URL.createObjectURL = vi.fn().mockReturnValue("blob:stub") as unknown as typeof URL.createObjectURL;
    URL.revokeObjectURL = vi.fn() as unknown as typeof URL.revokeObjectURL;

    listRequests.mockResolvedValueOnce({
      ok: true,
      value: { items: [item("evil", { headers: { "x-markup": markup }, body: enc(markup), path: "/evil", method: "POST" })], nextCursor: null },
    });
    const { container } = await renderInspector(["w1"]);
    await waitFor(() => expect(rowPaths(container)).toContain("/evil"));

    // row surfaces the path as text; no script element is ever mounted anywhere in the app
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(rowForPath(container, "/evil").querySelector("span.truncate")?.textContent).toBe("/evil");

    // headers tab
    const user = userEvent.setup();
    await user.click(screen.getByRole("tab", { name: /Headers 1/ }));
    await screen.findByText("x-markup");
    expect(container.querySelectorAll("script")).toHaveLength(0);
    expect(screen.getByText(markup).tagName).not.toBe("SCRIPT");

    // cURL copy — method interpolated unquoted per the contract; header/body stay escaped inert text
    fireEvent.click(screen.getByRole("button", { name: "Copy cURL" }));
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const curl = writeText.mock.calls[0][0] as string;
    expect(curl.startsWith("curl -X POST ")).toBe(true);
    expect(curl).toContain(`-H 'x-markup: <script>alert(1)</script>'`);
    expect(curl).toContain(`--data-raw '<script>alert(1)</script>'`);

    // downloaded blob carries the inert decoded text
    fireEvent.click(screen.getByRole("button", { name: "Body" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalled());
    const blob = (URL.createObjectURL as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as Blob;
    expect(await blob.text()).toBe(markup);
    expect(container.querySelectorAll("script")).toHaveLength(0);
  });
});