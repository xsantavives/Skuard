import {CatalogResourceType, Prisma, WebhookState, type CatalogWebhook} from "@prisma/client";
import {prisma} from "../db.server";
import {canonicalJson, hashCanonicalPayload, type JsonValue} from "./catalog-json.server";
import {snapshotDataFromWebhook} from "./catalog-snapshot.server";

export {canonicalJson, hashCanonicalPayload, payloadHash, type JsonValue} from "./catalog-json.server";

export const PRODUCT_TOPICS = ["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE"] as const;
export const COLLECTION_TOPICS = ["COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE"] as const;
export const CATALOG_TOPICS = [...PRODUCT_TOPICS, ...COLLECTION_TOPICS] as const;
export type CatalogTopic = (typeof CATALOG_TOPICS)[number];

export function resourceTypeForTopic(topic: string): CatalogResourceType | undefined {
  if (PRODUCT_TOPICS.includes(topic as (typeof PRODUCT_TOPICS)[number])) return CatalogResourceType.PRODUCT;
  if (COLLECTION_TOPICS.includes(topic as (typeof COLLECTION_TOPICS)[number])) return CatalogResourceType.COLLECTION;
  return undefined;
}

export interface CatalogWebhookRepository {
  create(data: Prisma.CatalogWebhookCreateInput): Promise<CatalogWebhook>;
  findByWebhookId(webhookId: string): Promise<CatalogWebhook | null>;
  createSnapshotAndMarkProcessed(record: CatalogWebhook): Promise<CatalogWebhook>;
  markFailed(id: string, error: string): Promise<CatalogWebhook>;
  recentForShop(shop: string, limit: number, filters?: CatalogDiagnosticFilters): Promise<CatalogWebhook[]>;
}

export interface CatalogDiagnosticFilters {
  resourceType?: CatalogResourceType;
  topic?: CatalogTopic;
}

const prismaRepository: CatalogWebhookRepository = {
  create: (data) => prisma.catalogWebhook.create({data}),
  findByWebhookId: (webhookId) => prisma.catalogWebhook.findUnique({where: {webhookId}}),
  createSnapshotAndMarkProcessed: (record) => prisma.$transaction(async (tx) => {
    await tx.catalogSnapshot.create({data: snapshotDataFromWebhook(record)});
    return tx.catalogWebhook.update({
      where: {id: record.id}, data: {state: WebhookState.PROCESSED, processedAt: new Date(), error: null},
    });
  }),
  markFailed: (id, error) =>
    prisma.catalogWebhook.update({where: {id}, data: {state: WebhookState.FAILED, error}}),
  recentForShop: (shop, limit, filters = {}) =>
    prisma.catalogWebhook.findMany({where: {shop, ...filters}, orderBy: {receivedAt: "desc"}, take: limit}),
};

function optionalString(value: unknown) {
  return typeof value === "string" || typeof value === "number" ? String(value) : undefined;
}

function optionalDate(value: unknown) {
  if (typeof value !== "string") return undefined;
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? undefined : date;
}

function isUniqueConflict(error: unknown) {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export async function ingestCatalogWebhook(
  input: {webhookId: string; shop: string; topic: string; payload: JsonValue},
  repository: CatalogWebhookRepository = prismaRepository,
) {
  const objectPayload = input.payload && !Array.isArray(input.payload) && typeof input.payload === "object" ? input.payload : {};
  const resourceType = resourceTypeForTopic(input.topic);
  if (!resourceType) throw new Error(`Unsupported catalog topic: ${input.topic}`);
  const payload = canonicalJson(input.payload);
  let record: CatalogWebhook;

  try {
    record = await repository.create({
      webhookId: input.webhookId,
      shop: input.shop,
      topic: input.topic,
      resourceType,
      payload,
      payloadHash: hashCanonicalPayload(payload),
      resourceId: optionalString(objectPayload.admin_graphql_api_id ?? objectPayload.id),
      occurredAt: optionalDate(objectPayload.occurred_at ?? objectPayload.updated_at ?? objectPayload.created_at),
      state: WebhookState.RECEIVED,
    });
  } catch (error) {
    if (!isUniqueConflict(error)) throw error;
    const duplicate = await repository.findByWebhookId(input.webhookId);
    if (!duplicate) throw error;
    if (duplicate.state === WebhookState.PROCESSED) return {record: duplicate, duplicate: true};
    try {
      record = await repository.createSnapshotAndMarkProcessed(duplicate);
      return {record, duplicate: true};
    } catch (retryError) {
      const message = retryError instanceof Error ? retryError.message : "Unknown processing failure";
      await repository.markFailed(duplicate.id, message).catch(() => undefined);
      throw retryError;
    }
  }

  try {
    record = await repository.createSnapshotAndMarkProcessed(record);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing failure";
    await repository.markFailed(record.id, message).catch(() => undefined);
    throw error;
  }

  return {record, duplicate: false};
}

export function parseCatalogDiagnosticFilters(searchParams: URLSearchParams): CatalogDiagnosticFilters {
  const resourceType = searchParams.get("resourceType");
  const topic = searchParams.get("topic");
  return {
    ...(Object.values(CatalogResourceType).includes(resourceType as CatalogResourceType)
      ? {resourceType: resourceType as CatalogResourceType} : {}),
    ...(CATALOG_TOPICS.includes(topic as CatalogTopic) ? {topic: topic as CatalogTopic} : {}),
  };
}

export function queryCatalogDiagnostics(
  shop: string,
  limit = 50,
  filters: CatalogDiagnosticFilters = {},
  repository: CatalogWebhookRepository = prismaRepository,
) {
  return repository.recentForShop(shop, Math.min(Math.max(limit, 1), 100), filters);
}
