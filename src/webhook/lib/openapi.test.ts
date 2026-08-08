import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { withRequestServerUrl } from "./openapi";

describe("withRequestServerUrl", () => {
  it("rewrites servers[0].url for the production host", () => {
    const document = { openapi: "3.0.0", servers: [{ url: "http://localhost" }], paths: {} };
    const request = new NextRequest("https://webhook.lik.is/openapi.json");

    const result = withRequestServerUrl(document, request);

    expect(result.servers[0].url).toBe("https://webhook.lik.is");
  });

  it("rewrites servers[0].url for localhost development", () => {
    const document = { openapi: "3.0.0", servers: [{ url: "http://localhost" }], paths: {} };
    const request = new NextRequest("http://localhost:3000/openapi.json");

    const result = withRequestServerUrl(document, request);

    expect(result.servers[0].url).toBe("http://localhost:3000");
  });

  it("rewrites servers[0].url for an arbitrary self-hosted host", () => {
    const document = { openapi: "3.0.0", servers: [{ url: "http://localhost" }], paths: {} };
    const request = new NextRequest("https://hooks.acme.example/openapi.json");

    const result = withRequestServerUrl(document, request);

    expect(result.servers[0].url).toBe("https://hooks.acme.example");
  });

  it("preserves document content and any non-URL server fields", () => {
    const document = {
      openapi: "3.0.0",
      servers: [
        { url: "http://localhost", description: "generated" },
        { url: "http://other.example" },
      ],
      paths: { "/webhooks": { get: { summary: "List webhooks" } } },
    };
    const request = new NextRequest("https://webhook.lik.is/openapi.json");

    const result = withRequestServerUrl(document, request);

    expect(result.servers[0]).toEqual({ url: "https://webhook.lik.is", description: "generated" });
    expect(result.servers[1]).toEqual({ url: "http://other.example" });
    expect(result.paths).toEqual({ "/webhooks": { get: { summary: "List webhooks" } } });
  });
});
