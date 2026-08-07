import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// R4: the capture endpoint always returns 200 to the caller, even when storage raises.
vi.mock("@/lib/db", () => ({
  getWebhook: vi.fn(() => ({ id: "fixed", createdAt: 0, lastActivityAt: 0, requestCount: 0, expiresAt: 0 })),
  insertCapturedRequest: vi.fn(() => {
    throw new Error("disk full");
  }),
  touchWebhook: vi.fn(),
}));

describe("capture handler — storage failure (R4)", () => {
  it("still responds 200 when the storage layer throws", async () => {
    const { POST } = await import("./route");
    const res = await POST(new NextRequest("http://localhost/fixed", { method: "POST", body: "x" }), {
      params: Promise.resolve({ id: "fixed", path: [] }),
    });
    expect(res.status).toBe(200);
  });
});
