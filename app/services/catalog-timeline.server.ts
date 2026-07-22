import {CatalogResourceType, Prisma} from "@prisma/client";
import {prisma} from "../db.server";
import {CATALOG_TOPICS, type CatalogTopic} from "./catalog-monitor.server";

export const DEFAULT_TIMELINE_LIMIT = 25;
export const MAX_TIMELINE_LIMIT = 50;
export const TIMELINE_ACTIONS = ["CREATED", "UPDATED", "DELETED"] as const;
export type CatalogTimelineAction = (typeof TIMELINE_ACTIONS)[number];

export interface CatalogTimelineEntry {
  id: string;
  resourceType: CatalogResourceType;
  resourceId: string;
  action: CatalogTimelineAction;
  sourceTopic: CatalogTopic;
  isDeleted: boolean;
  occurredAt: Date | null;
  receivedAt: Date;
  createdAt: Date;
  stateHash: string;
}

export interface CatalogTimelineFilters {
  resourceType?: CatalogResourceType;
  action?: CatalogTimelineAction;
  sourceTopic?: CatalogTopic;
  isDeleted?: boolean;
  resourceId?: string;
}

export interface CatalogTimelineCursor {
  effectiveAt: string;
  receivedAt: string;
  createdAt: string;
  id: string;
}

export interface CatalogTimelinePage {
  entries: CatalogTimelineEntry[];
  nextCursor?: string;
  hasNextPage: boolean;
}

export interface CatalogResourceHistory {
  resourceType: CatalogResourceType;
  resourceId: string;
  status: "ACTIVE" | "DELETED";
  entries: CatalogTimelineEntry[];
}

type SnapshotMetadata = Omit<CatalogTimelineEntry, "action">;

export interface CatalogTimelineRepository {
  findMetadata(input: {
    shop: string;
    take: number;
    filters: CatalogTimelineFilters;
    before?: CatalogTimelineCursor;
  }): Promise<SnapshotMetadata[]>;
}

const TOPIC_ACTIONS: Record<CatalogTopic, CatalogTimelineAction> = {
  PRODUCTS_CREATE: "CREATED", PRODUCTS_UPDATE: "UPDATED", PRODUCTS_DELETE: "DELETED",
  COLLECTIONS_CREATE: "CREATED", COLLECTIONS_UPDATE: "UPDATED", COLLECTIONS_DELETE: "DELETED",
};

export function actionForCatalogTopic(topic: string): CatalogTimelineAction {
  const action = TOPIC_ACTIONS[topic as CatalogTopic];
  if (!action) throw new Error(`Unsupported catalog timeline topic: ${topic}`);
  return action;
}

export function effectiveEventTime(entry: Pick<CatalogTimelineEntry, "occurredAt" | "receivedAt">) {
  return entry.occurredAt ?? entry.receivedAt;
}

/** Shared database ordering for all snapshot read models. */
export const CATALOG_TIMELINE_ORDER_SQL = Prisma.sql`
  COALESCE("occurredAt", "receivedAt") DESC, "receivedAt" DESC, "createdAt" DESC, "id" DESC
`;

export function snapshotBeforeSql(entry: CatalogTimelineCursor) {
  const effective = new Date(entry.effectiveAt); const received = new Date(entry.receivedAt);
  const created = new Date(entry.createdAt);
  return Prisma.sql`(
    COALESCE("occurredAt", "receivedAt") < ${effective} OR
    (COALESCE("occurredAt", "receivedAt") = ${effective} AND "receivedAt" < ${received}) OR
    (COALESCE("occurredAt", "receivedAt") = ${effective} AND "receivedAt" = ${received} AND "createdAt" < ${created}) OR
    (COALESCE("occurredAt", "receivedAt") = ${effective} AND "receivedAt" = ${received} AND "createdAt" = ${created} AND "id" < ${entry.id})
  )`;
}

// Newest first: effective event time, receivedAt, createdAt, then snapshot ID.
export function compareTimelineEntries(a: Pick<CatalogTimelineEntry, "id" | "occurredAt" | "receivedAt" | "createdAt">,
  b: Pick<CatalogTimelineEntry, "id" | "occurredAt" | "receivedAt" | "createdAt">) {
  const valuesA = [effectiveEventTime(a).valueOf(), a.receivedAt.valueOf(), a.createdAt.valueOf()];
  const valuesB = [effectiveEventTime(b).valueOf(), b.receivedAt.valueOf(), b.createdAt.valueOf()];
  for (let index = 0; index < valuesA.length; index += 1) {
    if (valuesA[index] !== valuesB[index]) return valuesB[index]! - valuesA[index]!;
  }
  return a.id === b.id ? 0 : a.id < b.id ? 1 : -1;
}

function boundedLimit(limit?: number) {
  if (!Number.isFinite(limit)) return DEFAULT_TIMELINE_LIMIT;
  return Math.min(Math.max(Math.trunc(limit!), 1), MAX_TIMELINE_LIMIT);
}

export function encodeTimelineCursor(entry: CatalogTimelineEntry) {
  const cursor: CatalogTimelineCursor = {
    effectiveAt: effectiveEventTime(entry).toISOString(), receivedAt: entry.receivedAt.toISOString(),
    createdAt: entry.createdAt.toISOString(), id: entry.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeTimelineCursor(value?: string | null): CatalogTimelineCursor | undefined {
  if (!value || value.length > 2048) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CatalogTimelineCursor>;
    if (typeof parsed.id !== "string" || !parsed.id || typeof parsed.effectiveAt !== "string" ||
      typeof parsed.receivedAt !== "string" || typeof parsed.createdAt !== "string") return undefined;
    for (const date of [parsed.effectiveAt, parsed.receivedAt, parsed.createdAt]) {
      if (Number.isNaN(new Date(date).valueOf())) return undefined;
    }
    return parsed as CatalogTimelineCursor;
  } catch {
    return undefined;
  }
}

export function parseTimelineFilters(params: URLSearchParams): CatalogTimelineFilters {
  const resourceType = params.get("resourceType");
  const action = params.get("action");
  const sourceTopic = params.get("topic");
  const deleted = params.get("deleted");
  return {
    ...(Object.values(CatalogResourceType).includes(resourceType as CatalogResourceType)
      ? {resourceType: resourceType as CatalogResourceType} : {}),
    ...(TIMELINE_ACTIONS.includes(action as CatalogTimelineAction) ? {action: action as CatalogTimelineAction} : {}),
    ...(CATALOG_TOPICS.includes(sourceTopic as CatalogTopic) ? {sourceTopic: sourceTopic as CatalogTopic} : {}),
    ...(deleted === "true" || deleted === "false" ? {isDeleted: deleted === "true"} : {}),
  };
}

function topicsForAction(action: CatalogTimelineAction) {
  return (Object.entries(TOPIC_ACTIONS) as [CatalogTopic, CatalogTimelineAction][])
    .filter(([, mapped]) => mapped === action).map(([topic]) => topic);
}

const prismaTimelineRepository: CatalogTimelineRepository = {
  findMetadata: ({shop, take, filters, before}) => {
    const conditions: Prisma.Sql[] = [Prisma.sql`"shop" = ${shop}`];
    if (filters.resourceType) conditions.push(Prisma.sql`"resourceType" = ${filters.resourceType}`);
    if (filters.sourceTopic) conditions.push(Prisma.sql`"sourceTopic" = ${filters.sourceTopic}`);
    if (filters.isDeleted !== undefined) conditions.push(Prisma.sql`"isDeleted" = ${filters.isDeleted}`);
    if (filters.resourceId) conditions.push(Prisma.sql`"resourceId" = ${filters.resourceId}`);
    if (filters.action) conditions.push(Prisma.sql`"sourceTopic" IN (${Prisma.join(topicsForAction(filters.action))})`);
    if (before) {
      conditions.push(snapshotBeforeSql(before));
    }
    return prisma.$queryRaw<SnapshotMetadata[]>(Prisma.sql`
      SELECT "id", "resourceType", "resourceId", "sourceTopic", "isDeleted",
        "occurredAt", "receivedAt", "createdAt", "stateHash"
      FROM "CatalogSnapshot"
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY ${CATALOG_TIMELINE_ORDER_SQL}
      LIMIT ${take}
    `);
  },
};

export async function queryCatalogTimeline(
  shop: string, options: {limit?: number; cursor?: string | null; filters?: CatalogTimelineFilters} = {},
  repository: CatalogTimelineRepository = prismaTimelineRepository,
): Promise<CatalogTimelinePage> {
  const limit = boundedLimit(options.limit);
  const rows = await repository.findMetadata({
    shop, take: limit + 1, filters: options.filters ?? {}, before: decodeTimelineCursor(options.cursor),
  });
  const mapped = rows.map((row) => ({...row, action: actionForCatalogTopic(row.sourceTopic)}));
  const hasNextPage = mapped.length > limit;
  const entries = mapped.slice(0, limit);
  return {entries, hasNextPage, ...(hasNextPage ? {nextCursor: encodeTimelineCursor(entries.at(-1)!)} : {})};
}

export async function queryCatalogResourceHistory(
  shop: string, resourceType: string, resourceId: string, limit = DEFAULT_TIMELINE_LIMIT,
  repository: CatalogTimelineRepository = prismaTimelineRepository,
): Promise<CatalogResourceHistory | undefined> {
  if (!Object.values(CatalogResourceType).includes(resourceType as CatalogResourceType) || !resourceId) return undefined;
  const page = await queryCatalogTimeline(shop, {
    limit, filters: {resourceType: resourceType as CatalogResourceType, resourceId},
  }, repository);
  if (!page.entries.length) return undefined;
  return {resourceType: resourceType as CatalogResourceType, resourceId,
    status: page.entries[0]!.isDeleted ? "DELETED" : "ACTIVE", entries: page.entries};
}
