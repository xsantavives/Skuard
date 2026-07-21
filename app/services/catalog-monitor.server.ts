import {createHash} from "node:crypto";
import {CatalogResourceType, Prisma, WebhookState, type CatalogWebhook} from "@prisma/client";
import {prisma} from "../db.server";

export const CATALOG_TOPIC_RESOURCE_TYPES = {
  PRODUCTS_CREATE: CatalogResourceType.PRODUCT,
  PRODUCTS_UPDATE: CatalogResourceType.PRODUCT,
  PRODUCTS_DELETE: CatalogResourceType.PRODUCT,
  COLLECTIONS_CREATE: CatalogResourceType.COLLECTION,
  COLLECTIONS_UPDATE: CatalogResourceType.COLLECTION,
  COLLECTIONS_DELETE: CatalogResourceType.COLLECTION,
} as const;

export const CATALOG_TOPICS = Object.keys(CATALOG_TOPIC_RESOURCE_TYPES) as Array<keyof typeof CATALOG_TOPIC_RESOURCE_TYPES>;

export type JsonValue = null | boolean | number | string | JsonValue[] | {[key: string]: JsonValue | undefined};

export interface CatalogWebhookRepository {
  create(data: Prisma.CatalogWebhookCreateInput): Promise<CatalogWebhook>;
  findByWebhookId(webhookId: string): Promise<CatalogWebhook | null>;
  markProcessed(id: string): Promise<CatalogWebhook>;
  markFailed(id: string, error: string): Promise<CatalogWebhook>;
  recentForShop(
    shop: string,
    limit: number,
    filters: {resourceType?: CatalogResourceType; topic?: string},
  ): Promise<CatalogWebhook[]>;
}

const prismaRepository: CatalogWebhookRepository = {
  create: (data) => prisma.catalogWebhook.create({data}),
  findByWebhookId: (webhookId) => prisma.catalogWebhook.findUnique({where: {webhookId}}),
  markProcessed: (id) =>
    prisma.catalogWebhook.update({
      where: {id},
      data: {state: WebhookState.PROCESSED, processedAt: new Date(), error: null},
    }),
  markFailed: (id, error) =>
    prisma.catalogWebhook.update({where: {id}, data: {state: WebhookState.FAILED, error}}),
  recentForShop: (shop, limit, filters) =>
    prisma.catalogWebhook.findMany({where: {shop, ...filters}, orderBy: {receivedAt: "desc"}, take: limit}),
};

export function catalogResourceTypeForTopic(topic: string): CatalogResourceType | undefined {
  return CATALOG_TOPIC_RESOURCE_TYPES[topic as keyof typeof CATALOG_TOPIC_RESOURCE_TYPES];
}

export function canonicalJson(value: JsonValue): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .filter((key) => value[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
    .join(",")}}`;
}

export function payloadHash(payload: JsonValue) {
  return hashCanonicalPayload(canonicalJson(payload));
}

export function hashCanonicalPayload(payload: string) {
  return createHash("sha256").update(payload).digest("hex");
}

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
  const payload = canonicalJson(input.payload);
  const resourceType = catalogResourceTypeForTopic(input.topic);
  if (!resourceType) throw new Error(`Unsupported catalog topic: ${input.topic}`);
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
    return {record: duplicate, duplicate: true};
  }

  try {
    record = await repository.markProcessed(record.id);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown processing failure";
    await repository.markFailed(record.id, message).catch(() => undefined);
    throw error;
  }

  return {record, duplicate: false};
}

export function catalogDiagnosticFilters(input: {resourceType?: string | null; topic?: string | null}) {
  const resourceType = Object.values(CatalogResourceType).includes(input.resourceType as CatalogResourceType)
    ? input.resourceType as CatalogResourceType
    : undefined;
  const topic = input.topic && catalogResourceTypeForTopic(input.topic) ? input.topic : undefined;
  return {resourceType, topic};
}

export function queryCatalogDiagnostics(
  shop: string,
  filters: {resourceType?: string | null; topic?: string | null} = {},
  limit = 50,
  repository: CatalogWebhookRepository = prismaRepository,
) {
  return repository.recentForShop(shop, Math.min(Math.max(limit, 1), 100), catalogDiagnosticFilters(filters));
}
