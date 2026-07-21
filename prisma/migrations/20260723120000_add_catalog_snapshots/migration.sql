CREATE TABLE "CatalogSnapshot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "resourceType" TEXT NOT NULL CHECK ("resourceType" IN ('PRODUCT', 'COLLECTION')),
    "resourceId" TEXT NOT NULL,
    "sourceWebhookId" TEXT NOT NULL,
    "sourceTopic" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "stateHash" TEXT NOT NULL,
    "isDeleted" BOOLEAN NOT NULL,
    "occurredAt" DATETIME,
    "receivedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CatalogSnapshot_sourceWebhookId_fkey" FOREIGN KEY ("sourceWebhookId") REFERENCES "CatalogWebhook" ("id") ON DELETE RESTRICT ON UPDATE RESTRICT
);

CREATE UNIQUE INDEX "CatalogSnapshot_sourceWebhookId_key" ON "CatalogSnapshot"("sourceWebhookId");
CREATE INDEX "CatalogSnapshot_shop_resourceType_resourceId_receivedAt_idx" ON "CatalogSnapshot"("shop", "resourceType", "resourceId", "receivedAt");
CREATE INDEX "CatalogSnapshot_shop_receivedAt_idx" ON "CatalogSnapshot"("shop", "receivedAt");
CREATE INDEX "CatalogSnapshot_shop_resourceType_receivedAt_idx" ON "CatalogSnapshot"("shop", "resourceType", "receivedAt");
CREATE INDEX "CatalogSnapshot_shop_sourceTopic_receivedAt_idx" ON "CatalogSnapshot"("shop", "sourceTopic", "receivedAt");
CREATE INDEX "CatalogSnapshot_shop_isDeleted_receivedAt_idx" ON "CatalogSnapshot"("shop", "isDeleted", "receivedAt");
