import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";

const DB_PATH = process.env.DB_PATH ?? "./data/webhook.db";

let client: PrismaClient | null = null;
let schemaEnsured = false;

function resolveDbPath(): string {
  return DB_PATH.startsWith("/") ? DB_PATH : `${process.cwd()}/${DB_PATH}`;
}

function getDbUrl(): string {
  return `file:${resolveDbPath()}`;
}

export async function ensureSchema(prisma: PrismaClient): Promise<void> {
  if (schemaEnsured) return;

  const migrationPath = path.join(process.cwd(), "prisma", "migrations", "0_init", "migration.sql");
  const sql = fs.readFileSync(migrationPath, "utf-8").replace(/--.*$/gm, "");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  for (const statement of statements) {
    await prisma.$executeRawUnsafe(`${statement};`);
  }

  schemaEnsured = true;
}

export function getClient(): PrismaClient {
  if (client) return client;

  fs.mkdirSync(path.dirname(resolveDbPath()), { recursive: true });
  client = new PrismaClient({ datasourceUrl: getDbUrl() });
  return client;
}
