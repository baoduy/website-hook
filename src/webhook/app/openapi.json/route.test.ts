import { describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/openapi.json", () => ({
  default: {
    openapi: "3.0.0",
    servers: [{ url: "http://localhost" }],
    paths: { "/webhooks": { get: { summary: "List webhooks" } } },
  },
}));

describe("GET /openapi.json", () => {
  it("serves the document with the production request's origin as the default server", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest("https://webhook.lik.is/openapi.json");

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.servers[0].url).toBe("https://webhook.lik.is");
    expect(body.paths).toEqual({ "/webhooks": { get: { summary: "List webhooks" } } });
  });

  it("serves the document with the localhost request's origin as the default server", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest("http://localhost:3000/openapi.json");

    const response = await GET(request);

    expect((await response.json()).servers[0].url).toBe("http://localhost:3000");
  });

  it("serves the document with an arbitrary self-hosted origin as the default server", async () => {
    const { GET } = await import("./route");
    const request = new NextRequest("https://hooks.acme.example/openapi.json");

    const response = await GET(request);

    expect((await response.json()).servers[0].url).toBe("https://hooks.acme.example");
  });
});
