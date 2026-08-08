import { describe, expect, it, vi } from "vitest";

const htmlResponse = new Response("<html><body>scalar</body></html>", {
  status: 200,
  headers: { "Content-Type": "text/html" },
});

vi.mock("@scalar/nextjs-api-reference", () => ({
  ApiReference: vi.fn(() => () => htmlResponse),
}));

describe("GET /api/reference", () => {
  it("serves the Scalar interactive API reference as HTML", async () => {
    const { GET } = await import("./route");

    const res = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
    expect(await res.text()).toContain("scalar");
  });
});
