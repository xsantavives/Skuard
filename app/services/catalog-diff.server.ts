import {CatalogResourceType, Prisma} from "@prisma/client";
import {prisma} from "../db.server";
import type {JsonValue} from "./catalog-json.server";
import {actionForCatalogTopic, CATALOG_TIMELINE_ORDER_SQL, effectiveEventTime, snapshotBeforeSql} from "./catalog-timeline.server";

export const DEFAULT_CATALOG_DIFF_LIMITS = {maxDepth: 32, maxVisitedNodes: 20_000, maxEntries: 200} as const;
export interface CatalogDiffLimits {maxDepth: number; maxVisitedNodes: number; maxEntries: number}
export type CatalogDiffOperation = "ADDED" | "REMOVED" | "CHANGED";
export interface CatalogDiffEntry {path: string; operation: CatalogDiffOperation; before?: JsonValue; after?: JsonValue}
export interface JsonDiffResult {entries: CatalogDiffEntry[]; truncated: boolean; visitedNodes: number}
export type CatalogDiffStatus = "COMPARABLE" | "NO_PREVIOUS_SNAPSHOT" | "CREATED_WITHOUT_BASELINE" |
  "DELETED_TOMBSTONE" | "PREVIOUS_TOMBSTONE" | "LIMIT_EXCEEDED" | "INVALID_LIFECYCLE";
export interface CatalogStructuralDiff {
  currentSnapshotId: string; previousSnapshotId?: string; resourceType: CatalogResourceType; resourceId: string;
  status: CatalogDiffStatus; entries: CatalogDiffEntry[]; returnedChangeCount: number; truncated: boolean;
  currentEffectiveAt: Date; previousEffectiveAt?: Date; currentAction: "CREATED" | "UPDATED" | "DELETED";
}

const jsonType = (value: JsonValue) => value === null ? "null" : Array.isArray(value) ? "array" : typeof value;
const childPath = (path: string, key: string) => `${path}/${key.replaceAll("~", "~0").replaceAll("/", "~1")}`;

export function diffCanonicalJson(previous: JsonValue, current: JsonValue,
  limits: CatalogDiffLimits = DEFAULT_CATALOG_DIFF_LIMITS): JsonDiffResult {
  const entries: CatalogDiffEntry[] = []; let visitedNodes = 0; let truncated = false;
  const add = (entry: CatalogDiffEntry) => {
    if (entries.length >= Math.max(0, limits.maxEntries)) { truncated = true; return; }
    entries.push(entry);
  };
  const walk = (before: JsonValue, after: JsonValue, path: string, depth: number) => {
    if (truncated || depth > limits.maxDepth || visitedNodes >= limits.maxVisitedNodes) { truncated = true; return; }
    visitedNodes += 1;
    const beforeType = jsonType(before); const afterType = jsonType(after);
    if (beforeType !== afterType) { add({path, operation: "CHANGED", before, after}); return; }
    if (Array.isArray(before) && Array.isArray(after)) {
      for (let index = 0; index < Math.max(before.length, after.length) && !truncated; index += 1) {
        const indexedPath = childPath(path, String(index));
        if (index >= before.length) add({path: indexedPath, operation: "ADDED", after: after[index]!});
        else if (index >= after.length) add({path: indexedPath, operation: "REMOVED", before: before[index]!});
        else walk(before[index]!, after[index]!, indexedPath, depth + 1);
      }
      return;
    }
    if (beforeType === "object") {
      const oldObject = before as Record<string, JsonValue>; const newObject = after as Record<string, JsonValue>;
      const keys = [...new Set([...Object.keys(oldObject), ...Object.keys(newObject)])].sort();
      for (const key of keys) {
        if (truncated) break;
        const hasBefore = Object.prototype.hasOwnProperty.call(oldObject, key);
        const hasAfter = Object.prototype.hasOwnProperty.call(newObject, key); const keyedPath = childPath(path, key);
        if (!hasBefore) add({path: keyedPath, operation: "ADDED", after: newObject[key]!});
        else if (!hasAfter) add({path: keyedPath, operation: "REMOVED", before: oldObject[key]!});
        else walk(oldObject[key]!, newObject[key]!, keyedPath, depth + 1);
      }
      return;
    }
    if (before !== after) add({path, operation: "CHANGED", before, after});
  };
  walk(previous, current, "", 0); return {entries, truncated, visitedNodes};
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
  const result = diffCanonicalJson(lifecycle.previousState, lifecycle.currentState, limits);
  return {...withPrevious, status: result.truncated ? "LIMIT_EXCEEDED" : "COMPARABLE", entries: result.entries,
    returnedChangeCount: result.entries.length, truncated: result.truncated};
}
