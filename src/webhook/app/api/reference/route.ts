import { ApiReference } from "@scalar/nextjs-api-reference";

// The OpenAPI spec is generated into public/openapi.json at build time.
export const GET = ApiReference({ url: "/openapi.json" });
