-- CreateTable
CREATE TABLE IF NOT EXISTS "webhooks" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "created_at" BIGINT NOT NULL,
    "last_activity_at" BIGINT NOT NULL
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "captured_requests" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhook_id" TEXT NOT NULL,
    "created_at" BIGINT NOT NULL,
    "method" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "headers" TEXT NOT NULL,
    "body" BLOB,
    "truncated" BOOLEAN NOT NULL,
    CONSTRAINT "captured_requests_webhook_id_fkey" FOREIGN KEY ("webhook_id") REFERENCES "webhooks" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "captured_requests_webhook_id_idx" ON "captured_requests"("webhook_id");
