import {CatalogResourceType, Prisma} from "@prisma/client";
import {prisma} from "../db.server";
import type {JsonValue} from "./catalog-json.server";
import {DEFAULT_CATALOG_DIFF_LIMITS, type CatalogDiffEntry, type CatalogDiffLimits} from "./catalog-structural-diff";
import {analyzeCatalogComparison, type PricingCoverage, type VariantPricingChange} from "./catalog-comparison-analysis";
import {actionForCatalogTopic, CATALOG_TIMELINE_ORDER_SQL, effectiveEventTime, snapshotBeforeSql} from "./catalog-timeline.server";

export type CatalogDiffStatus = "COMPARABLE" | "NO_PREVIOUS_SNAPSHOT" | "CREATED_WITHOUT_BASELINE" |
  "DELETED_TOMBSTONE" | "PREVIOUS_TOMBSTONE" | "LIMIT_EXCEEDED" | "INVALID_LIFECYCLE";
export interface CatalogStructuralDiff {
  currentSnapshotId: string; previousSnapshotId?: string; resourceType: CatalogResourceType; resourceId: string;
  status: CatalogDiffStatus; entries: CatalogDiffEntry[]; returnedChangeCount: number; truncated: boolean;
  currentEffectiveAt: Date; previousEffectiveAt?: Date; currentAction: "CREATED" | "UPDATED" | "DELETED";
  signals?: import("./catalog-change-signals").CatalogChangeSignal[]; findings?: import("./catalog-comparison-findings").CatalogComparisonFinding[];
  pricingChanges?: VariantPricingChange[]; pricingCoverage?: PricingCoverage;
}

export interface DiffSnapshot {id: string; resourceType: CatalogResourceType; resourceId: string; sourceTopic: string;
  state: string; isDeleted: boolean; occurredAt: Date | null; receivedAt: Date; createdAt: Date}
export type CatalogComparableLifecycle =
  | {comparable: true; previousState: JsonValue; currentState: JsonValue}
  | {comparable: false; reason: "CURRENT_NOT_UPDATE" | "CURRENT_TOMBSTONE" | "PREVIOUS_TOMBSTONE" | "INVALID_LIFECYCLE" | "INVALID_STATE"};

/** Pure SKU-006 lifecycle gate shared by individual and historical comparisons. */
export function catalogComparableLifecycle(current: DiffSnapshot, previous: DiffSnapshot): CatalogComparableLifecycle {
  let currentAction: ReturnType<typeof actionForCatalogTopic>; let previousAction: ReturnType<typeof actionForCatalogTopic>;
  try { currentAction = actionForCatalogTopic(current.sourceTopic); previousAction = actionForCatalogTopic(previous.sourceTopic); }
  catch { return {comparable: false, reason: "INVALID_LIFECYCLE"}; }
  if ((currentAction === "DELETED") !== current.isDeleted || (previousAction === "DELETED") !== previous.isDeleted)
    return {comparable: false, reason: "INVALID_LIFECYCLE"};
  if (current.isDeleted) return {comparable: false, reason: "CURRENT_TOMBSTONE"};
  if (previous.isDeleted) return {comparable: false, reason: "PREVIOUS_TOMBSTONE"};
  if (currentAction !== "UPDATED") return {comparable: false, reason: "CURRENT_NOT_UPDATE"};
  try {
    return {comparable: true, previousState: JSON.parse(previous.state) as JsonValue,
      currentState: JSON.parse(current.state) as JsonValue};
  } catch { return {comparable: false, reason: "INVALID_STATE"}; }
}
export interface CatalogDiffRepository {
  findCurrent(input: {shop: string; resourceType: CatalogResourceType; resourceId: string; snapshotId: string}): Promise<DiffSnapshot | null>;
  findPrevious(input: {shop: string; current: DiffSnapshot}): Promise<DiffSnapshot | null>;
}
const select = {id: true, resourceType: true, resourceId: true, sourceTopic: true, state: true, isDeleted: true,
  occurredAt: true, receivedAt: true, createdAt: true} as const;
const catalogDiffRepository: CatalogDiffRepository = {
  findCurrent: ({shop, resourceType, resourceId, snapshotId}) => prisma.catalogSnapshot.findFirst({
    where: {id: snapshotId, shop, resourceType, resourceId}, select,
  }),
  findPrevious: ({shop, current}) => prisma.$queryRaw<DiffSnapshot[]>(Prisma.sql`
    SELECT "id", "resourceType", "resourceId", "sourceTopic", "state", "isDeleted", "occurredAt", "receivedAt", "createdAt"
    FROM "CatalogSnapshot" WHERE "shop" = ${shop} AND "resourceType" = ${current.resourceType}
      AND "resourceId" = ${current.resourceId} AND ${snapshotBeforeSql({effectiveAt: effectiveEventTime(current).toISOString(),
        receivedAt: current.receivedAt.toISOString(), createdAt: current.createdAt.toISOString(), id: current.id})}
    ORDER BY ${CATALOG_TIMELINE_ORDER_SQL} LIMIT 1
  `).then((rows) => rows[0] ?? null),
};

export async function queryCatalogStructuralDiff(shop: string, resourceType: string, resourceId: string,
  snapshotId: string, repository: CatalogDiffRepository = catalogDiffRepository,
  limits: CatalogDiffLimits = DEFAULT_CATALOG_DIFF_LIMITS): Promise<CatalogStructuralDiff | undefined> {
  if (!shop || !resourceId || !snapshotId || snapshotId.length > 191 ||
    !Object.values(CatalogResourceType).includes(resourceType as CatalogResourceType)) return undefined;
  const current = await repository.findCurrent({shop, resourceType: resourceType as CatalogResourceType, resourceId, snapshotId});
  if (!current) return undefined;
  let action: CatalogStructuralDiff["currentAction"] = "UPDATED"; let validAction = true;
  try { action = actionForCatalogTopic(current.sourceTopic); } catch { validAction = false; }
  const base = {currentSnapshotId: current.id, resourceType: current.resourceType, resourceId: current.resourceId,
    entries: [] as CatalogDiffEntry[], returnedChangeCount: 0, truncated: false,
    currentEffectiveAt: effectiveEventTime(current), currentAction: action};
  if (!validAction || (action === "DELETED") !== current.isDeleted) return {...base, status: "INVALID_LIFECYCLE"};
  if (current.isDeleted) return {...base, status: "DELETED_TOMBSTONE"};
  const previous = await repository.findPrevious({shop, current});
  if (!previous) return {...base, status: action === "CREATED" ? "CREATED_WITHOUT_BASELINE" : "NO_PREVIOUS_SNAPSHOT"};
  const withPrevious = {...base, previousSnapshotId: previous.id, previousEffectiveAt: effectiveEventTime(previous)};
  const lifecycle = catalogComparableLifecycle(current, previous);
  if (!lifecycle.comparable) {
    const status = lifecycle.reason === "PREVIOUS_TOMBSTONE" ? "PREVIOUS_TOMBSTONE" :
      lifecycle.reason === "CURRENT_NOT_UPDATE" ? "CREATED_WITHOUT_BASELINE" : "INVALID_LIFECYCLE";
    return {...withPrevious, status};
  }
  const analysis = analyzeCatalogComparison(current.resourceType, lifecycle.previousState, lifecycle.currentState, {structural: limits});
  return {...withPrevious, status: analysis.structural.truncated ? "LIMIT_EXCEEDED" : "COMPARABLE", entries: analysis.structural.entries,
    returnedChangeCount: analysis.structural.entries.length, truncated: analysis.structural.truncated, signals: analysis.signals,
    findings: analysis.findings, ...(analysis.pricing ? {pricingChanges: analysis.pricing.changes, pricingCoverage: analysis.pricing.coverage} : {})};
}
