import { defineConfig } from "prisma/config";

// Prisma 7 moved the datasource URL out of schema.prisma. Only the CLI (`prisma migrate`) reads it;
// the runtime client gets its connection from the driver adapter in lib/prisma.ts.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: { url: process.env.DB_URL ?? "file:./data/webhook.db" },
});
