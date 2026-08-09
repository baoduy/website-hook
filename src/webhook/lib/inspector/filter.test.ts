import { describe, expect, it } from "vitest";
import { filterRequests, METHOD_FILTERS, resolveMethod, resolveSelection } from "./filter";
import type { CapturedRequest } from "./api";

const req = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: "r1",
  method: "POST",
  path: "/orders/9182",
  query: "a=1&status=shipped",
  headers: { "content-type": "application/json", "x-token": "sekret" },
  body: Buffer.from('{"status":"shipped"}', "utf-8").toString("base64"),
  truncated: false,
  createdAt: 0,
  ...overrides,
});

// A request that does NOT contain "shipped", used to keep the search assertions unambiguous.
const cleanGet = (overrides: Partial<CapturedRequest> = {}): CapturedRequest => ({
  id: "rX",
  method: "GET",
  path: "/users",
  query: "",
  headers: {},
  body: "",
  truncated: false,
  createdAt: 0,
  ...overrides,
});

describe("resolveMethod", () => {
  it("ALL resolves to null (no method constraint)", () => {
    expect(resolveMethod("ALL")).toBeNull();
  });
  it("DEL expands to the wire method DELETE", () => {
    expect(resolveMethod("DEL")).toBe("DELETE");
  });
  it.each(["GET", "POST", "PUT", "PATCH"] as const)("%s maps verbatim", (m) => {
    expect(resolveMethod(m)).toBe(m);
  });
  it("METHOD_FILTERS lists the segmented-control labels", () => {
    expect(METHOD_FILTERS).toEqual(["ALL", "GET", "POST", "PUT", "PATCH", "DEL"]);
  });
});

describe("filterRequests", () => {
  const all = [cleanGet({ id: "r1" }), req({ id: "r2" })];

  it("returns everything with no search and ALL method", () => {
    expect(filterRequests(all, "", "ALL")).toHaveLength(2);
  });

  it("filters by method, mapping DEL to DELETE", () => {
    expect(filterRequests(all, "", "GET")).toHaveLength(1);
    expect(filterRequests(all, "", "DEL")).toHaveLength(0);
    expect(filterRequests([req({ method: "DELETE" })], "", "DEL")).toHaveLength(1);
  });

  it("search is case-insensitive across path, query, headers and body", () => {
    expect(filterRequests(all, "SHIPPED", "ALL")).toHaveLength(1);
    expect(filterRequests(all, "users", "ALL")).toHaveLength(1);
    expect(filterRequests(all, "sekret", "ALL")).toHaveLength(1);
    expect(filterRequests(all, "missing", "ALL")).toHaveLength(0);
  });

  it("trims the search needle", () => {
    expect(filterRequests(all, "  shipped  ", "ALL")).toHaveLength(1);
  });

  it("combines method and search constraints", () => {
    expect(filterRequests(all, "shipped", "POST")).toHaveLength(1);
    expect(filterRequests(all, "shipped", "GET")).toHaveLength(0);
  });
});

describe("resolveSelection", () => {
  const a = req({ id: "a" });
  const b = req({ id: "b" });
  const filtered = [a, b];

  it("keeps the selected request when it is still filtered in", () => {
    expect(resolveSelection(filtered, "b")?.id).toBe("b");
  });

  it("falls back to the first filtered row when the selection is filtered out", () => {
    expect(resolveSelection(filtered, "gone")?.id).toBe("a");
  });

  it("returns null when nothing remains after filtering", () => {
    expect(resolveSelection([], "x")).toBeNull();
    expect(resolveSelection([], null)).toBeNull();
  });

  it("falls back to the first row when no selection exists yet", () => {
    expect(resolveSelection(filtered, null)?.id).toBe("a");
  });
});