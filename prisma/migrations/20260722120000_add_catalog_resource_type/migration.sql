ALTER TABLE "CatalogWebhook"
ADD COLUMN "resourceType" TEXT NOT NULL DEFAULT 'PRODUCT'
CHECK ("resourceType" IN ('PRODUCT', 'COLLECTION'));

CREATE INDEX "CatalogWebhook_shop_resourceType_receivedAt_idx"
ON "CatalogWebhook"("shop", "resourceType", "receivedAt");
