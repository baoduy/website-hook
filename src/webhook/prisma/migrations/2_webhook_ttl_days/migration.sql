-- AlterTable
-- Rows that exist at rollout get 7 days. No UPDATE here: ensureSchema replays this file on every start.
ALTER TABLE "webhooks" ADD COLUMN "ttl_days" INTEGER DEFAULT 7;
