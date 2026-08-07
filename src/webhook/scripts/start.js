/* eslint-disable @typescript-eslint/no-require-imports */
const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const { PrismaClient } = require("@prisma/client");

const DB_PATH = process.env.DB_PATH ?? "/data/webhook.db";
const dbUrl = `file:${path.isAbsolute(DB_PATH) ? DB_PATH : path.resolve(DB_PATH)}`;
const migrationPath = path.join(process.cwd(), "prisma", "migrations", "0_init", "migration.sql");

async function provisionSchema() {
  fs.mkdirSync(path.dirname(path.resolve(DB_PATH)), { recursive: true });

  const sql = fs.readFileSync(migrationPath, "utf-8").replace(/--.*$/gm, "");
  const statements = sql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.length > 0);

  const prisma = new PrismaClient({ datasourceUrl: dbUrl });
  try {
    for (const statement of statements) {
      await prisma.$executeRawUnsafe(`${statement};`);
    }
  } finally {
    await prisma.$disconnect();
  }
}

provisionSchema()
  .then(() => {
    const child = spawn("node", ["server.js"], { stdio: "inherit" });
    child.on("exit", (code, signal) => {
      process.exit(code ?? (signal ? 1 : 0));
    });
  })
  .catch((err) => {
    console.error("schema provisioning failed:", err);
    process.exit(1);
  });
