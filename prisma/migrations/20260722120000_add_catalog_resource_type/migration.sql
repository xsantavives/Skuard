PRAGMA foreign_keys=OFF;

CREATE TABLE "new_CatalogWebhook" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "webhookId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL DEFAULT 'PRODUCT' CHECK ("resourceType" IN ('PRODUCT', 'COLLECTION')),
    "payload" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "resourceId" TEXT,
    "occurredAt" DATETIME,
    "state" TEXT NOT NULL DEFAULT 'RECEIVED',
    "error" TEXT,
    "receivedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" DATETIME
);

INSERT INTO "new_CatalogWebhook" ("id", "webhookId", "shop", "topic", "resourceType", "payload", "payloadHash", "resourceId", "occurredAt", "state", "error", "receivedAt", "processedAt")
SELECT "id", "webhookId", "shop", "topic", 'PRODUCT', "payload", "payloadHash", "productResourceId", "occurredAt", "state", "error", "receivedAt", "processedAt" FROM "CatalogWebhook";

DROP TABLE "CatalogWebhook";
ALTER TABLE "new_CatalogWebhook" RENAME TO "CatalogWebhook";
CREATE UNIQUE INDEX "CatalogWebhook_webhookId_key" ON "CatalogWebhook"("webhookId");
CREATE INDEX "CatalogWebhook_shop_receivedAt_idx" ON "CatalogWebhook"("shop", "receivedAt");
CREATE INDEX "CatalogWebhook_shop_resourceType_receivedAt_idx" ON "CatalogWebhook"("shop", "resourceType", "receivedAt");

PRAGMA foreign_keys=ON;
