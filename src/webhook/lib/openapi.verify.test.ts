import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { withRequestServerUrl } from "./openapi";
import buildTimeDocument from "@/lib/openapi.json";

type Doc = { servers?: Array<{ url: string }> };

describe("withRequestServerUrl — QC verification (DRK-255)", () => {
  it("creates a default server from the request origin when the document has no servers", () => {
    const document = { openapi: "3.0.0", paths: {} } as Doc;
    const request = new NextRequest("https://webhook.lik.is/openapi.json");

    const result = withRequestServerUrl(document, request);

    expect(result.servers).toEqual([{ url: "https://webhook.lik.is" }]);
  });

  it("creates a default server from the request origin when the document has an empty servers array", () => {
    const document = { openapi: "3.0.0", servers: [], paths: {} } as Doc;
    const request = new NextRequest("http://localhost:3000/openapi.json");

    const result = withRequestServerUrl(document, request);

    expect(result.servers).toEqual([{ url: "http://localhost:3000" }]);
  });

  it("produces a document identical to the build-time output except for servers[0].url", () => {
    const request = new NextRequest("https://hooks.acme.example/openapi.json");
    const original = structuredClone(buildTimeDocument);

    const result = withRequestServerUrl(buildTimeDocument, request);

    expect(result.servers[0].url).toBe("https://hooks.acme.example");
    expect(result.openapi).toBe(original.openapi);
    expect(result.info).toEqual(original.info);
    expect(result.paths).toEqual(original.paths);
    expect(result.servers.length).toBe(original.servers.length);
    for (let i = 1; i < original.servers.length; i++) {
      expect(result.servers[i]).toEqual(original.servers[i]);
    }
  });
});
