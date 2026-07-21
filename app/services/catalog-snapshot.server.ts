import {CatalogResourceType, type CatalogSnapshot, type CatalogWebhook, Prisma} from "@prisma/client";
import {prisma} from "../db.server";
import {canonicalJson, hashCanonicalPayload, type JsonValue} from "./catalog-json.server";

export const DELETION_TOPICS = ["PRODUCTS_DELETE", "COLLECTIONS_DELETE"] as const;

export function isDeletionTopic(topic: string) {
  return DELETION_TOPICS.includes(topic as (typeof DELETION_TOPICS)[number]);
}

export function createSnapshotState(payload: JsonValue) {
  return canonicalJson(payload);
}

export function snapshotStateHash(state: string) {
  return hashCanonicalPayload(state);
}

export function snapshotDataFromWebhook(webhook: CatalogWebhook): Prisma.CatalogSnapshotUncheckedCreateInput {
  if (!webhook.resourceId) throw new Error(`Catalog webhook ${webhook.id} has no resource ID`);
  const state = createSnapshotState(JSON.parse(webhook.payload) as JsonValue);
  return {
    shop: webhook.shop,
    resourceType: webhook.resourceType,
    resourceId: webhook.resourceId,
    sourceWebhookId: webhook.id,
    sourceTopic: webhook.topic,
    state,
    stateHash: snapshotStateHash(state),
    isDeleted: isDeletionTopic(webhook.topic),
    occurredAt: webhook.occurredAt,
    receivedAt: webhook.receivedAt,
  };
}

export interface SnapshotDiagnosticFilters {
  resourceType?: CatalogResourceType;
  sourceTopic?: string;
  isDeleted?: boolean;
}

export interface CatalogSnapshotRepository {
  create(data: Prisma.CatalogSnapshotUncheckedCreateInput): Promise<CatalogSnapshot>;
  findBySourceWebhookId(sourceWebhookId: string): Promise<CatalogSnapshot | null>;
  recentForShop(shop: string, limit: number, filters: SnapshotDiagnosticFilters): Promise<CatalogSnapshot[]>;
}

const snapshotRepository: CatalogSnapshotRepository = {
  create: (data) => prisma.catalogSnapshot.create({data}),
  findBySourceWebhookId: (sourceWebhookId) => prisma.catalogSnapshot.findUnique({where: {sourceWebhookId}}),
  recentForShop: (shop, limit, filters) => prisma.catalogSnapshot.findMany({
    where: {shop, ...filters}, orderBy: [{receivedAt: "desc"}, {createdAt: "desc"}], take: limit,
  }),
};

export async function persistCatalogSnapshot(
  webhook: CatalogWebhook,
  repository: CatalogSnapshotRepository = snapshotRepository,
) {
  const existing = await repository.findBySourceWebhookId(webhook.id);
  if (existing) return {snapshot: existing, duplicate: true};
  return {snapshot: await repository.create(snapshotDataFromWebhook(webhook)), duplicate: false};
}

const VALID_TOPICS = new Set([
  "PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE",
  "COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE",
]);

export function parseSnapshotDiagnosticFilters(params: URLSearchParams): SnapshotDiagnosticFilters {
  const resourceType = params.get("snapshotResourceType");
  const sourceTopic = params.get("snapshotTopic");
  const deleted = params.get("snapshotDeleted");
  return {
    ...(Object.values(CatalogResourceType).includes(resourceType as CatalogResourceType)
      ? {resourceType: resourceType as CatalogResourceType} : {}),
    ...(sourceTopic && VALID_TOPICS.has(sourceTopic) ? {sourceTopic} : {}),
    ...(deleted === "true" || deleted === "false" ? {isDeleted: deleted === "true"} : {}),
  };
}

export function querySnapshotDiagnostics(
  shop: string,
  limit = 50,
  filters: SnapshotDiagnosticFilters = {},
  repository: CatalogSnapshotRepository = snapshotRepository,
) {
  return repository.recentForShop(shop, Math.min(Math.max(limit, 1), 100), filters);
}
