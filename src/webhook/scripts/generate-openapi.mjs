import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const openapiPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../node_modules/@scalar/nextjs-openapi/dist/openapi.js",
);

// ponytail: fast-glob is CJS and @scalar/nextjs-openapi imports a named export that fails in ESM.
// Rewrite the import to default-import + destructuring so the build-time generator can run in Node.js.
let content = fs.readFileSync(openapiPath, "utf-8");
content = content.replace(
  "import { sync } from 'fast-glob';",
  "import fg from 'fast-glob';\nconst { sync } = fg;",
);
fs.writeFileSync(openapiPath, content);

const { OpenAPI } = await import("@scalar/nextjs-openapi");

const handler = OpenAPI({ apiDirectory: "app/api" });
const req = { nextUrl: { pathname: "/openapi.json", origin: "http://localhost" } };
const res = await handler.GET(req);
const spec = await res.json();

fs.mkdirSync("public", { recursive: true });
fs.writeFileSync("public/openapi.json", JSON.stringify(spec, null, 2));
