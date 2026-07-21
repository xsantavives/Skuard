CREATE TABLE "CatalogWebhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "payload" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "productResourceId" TEXT,
    "occurredAt" DATETIME,
    "state" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

CREATE UNIQUE INDEX "CatalogWebhook_webhookId_key" ON "CatalogWebhook"("webhookId");
CREATE INDEX "CatalogWebhook_shop_receivedAt_idx" ON "CatalogWebhook"("shop", "receivedAt");
