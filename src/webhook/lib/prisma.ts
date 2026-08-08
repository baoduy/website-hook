import { getCloudflareContext } from "@opennextjs/cloudflare";
import { PrismaD1 } from "@prisma/adapter-d1";
import { PrismaClient } from "@prisma/client";

type D1DatabaseBinding = ConstructorParameters<typeof PrismaD1>[0];

declare global {
  interface CloudflareEnv {
    DB: D1DatabaseBinding;
  }
}

const DB_PATH = process.env.DB_PATH ?? "./data/webhook.db";

let client: PrismaClient | null = null;
let schemaEnsured = false;
let workersRuntime: boolean | undefined;

function isWorkersRuntime(): boolean {
  if (workersRuntime !== undefined) return workersRuntime;

  // Probe the Cloudflare context directly. `process.env.NEXT_RUNTIME` is
  // statically replaced to "nodejs" by the bundler, so it cannot be trusted.
  try {
    const { env } = getCloudflareContext();
    workersRuntime = env.DB !== undefined;
  } catch {
    workersRuntime = false;
  }

  return workersRuntime;
}

export async function ensureSchema(prisma: PrismaClient): Promise<void> {
  if (schemaEnsured) return;
  // ponytail: D1 schema is applied at deploy time via `wrangler d1 migrations apply`.
  if (isWorkersRuntime()) {
    schemaEnsured = true;
    return;
  }

  // Node.js-only imports — kept out of the Workers bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");

  const migrationPath = path.join(process.cwd(), "prisma", "migrations", "0_init", "migration.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8").replace(/--.*$/gm, "");
  const statements = sql
    .split(";")
    .map((statement: string) => statement.trim())
    .filter((statement: string) => statement.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(`${statement};`);
  }

  schemaEnsured = true;
}

export function getClient(): PrismaClient {
  if (client) return client;

  if (isWorkersRuntime()) {
    const { env } = getCloudflareContext();
    // ponytail: D1 binding is set at deploy time; optional chaining lets the build complete without it.
    client = new PrismaClient({ adapter: new PrismaD1(env.DB as D1DatabaseBinding) });
    return client;
  }

  // Node.js-only imports — kept out of the Workers bundle.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("node:fs");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path");

  const resolvedPath = DB_PATH.startsWith("/") ? DB_PATH : `${process.cwd()}/${DB_PATH}`;
  fs.mkdirSync(path.dirname(resolvedPath), { recursive: true });
  client = new PrismaClient({ datasourceUrl: `file:${resolvedPath}` });
  return client;
}
