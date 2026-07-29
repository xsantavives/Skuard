import {CatalogResourceType, Prisma} from "@prisma/client";
import {prisma} from "../db.server";
import {CATALOG_COMPARISON_FINDING_CODES,
  type CatalogComparisonFindingCode} from "./catalog-comparison-findings";
import {catalogComparableLifecycle, type DiffSnapshot} from "./catalog-diff.server";
import {analyzeCatalogComparison} from "./catalog-comparison-analysis";
import {CATALOG_TIMELINE_ORDER_SQL, compareTimelineEntries, effectiveEventTime} from "./catalog-timeline.server";

export const DEFAULT_HISTORICAL_COMPARISON_LIMIT = 10;
export const MAX_HISTORICAL_COMPARISON_LIMIT = 20;

export interface CatalogHistoricalFindingReference {
  currentSnapshotId: string; previousSnapshotId: string; currentEffectiveAt: Date; previousEffectiveAt: Date;
  evidenceCount: number; truncated: boolean;
}
export interface CatalogHistoricalFindingSummaryItem {
  code: CatalogComparisonFindingCode; label: string; comparisonCount: number; evidenceCount: number;
  occurrences: CatalogHistoricalFindingReference[];
}
export interface CatalogHistoricalFindingSummary {
  resourceType: CatalogResourceType; resourceId: string; requestedComparisonLimit: number; snapshotCount: number;
  adjacentPairCount: number; comparablePairCount: number; skippedPairCount: number; truncatedComparisonCount: number;
  findings: CatalogHistoricalFindingSummaryItem[]; historyExhausted: boolean;
}
export interface CatalogFindingHistoryRepository {
  findRecent(input: {shop: string; resourceType: CatalogResourceType; resourceId: string; take: number}): Promise<DiffSnapshot[]>;
}

export function normalizeHistoricalComparisonLimit(limit: number = DEFAULT_HISTORICAL_COMPARISON_LIMIT) {
  return Number.isInteger(limit) && limit > 0 ? Math.min(limit, MAX_HISTORICAL_COMPARISON_LIMIT) : DEFAULT_HISTORICAL_COMPARISON_LIMIT;
}

const repository: CatalogFindingHistoryRepository = {
  findRecent: ({shop, resourceType, resourceId, take}) => prisma.$queryRaw<DiffSnapshot[]>(Prisma.sql`
    SELECT "id", "resourceType", "resourceId", "sourceTopic", "state", "isDeleted", "occurredAt", "receivedAt", "createdAt"
    FROM "CatalogSnapshot" WHERE "shop" = ${shop} AND "resourceType" = ${resourceType} AND "resourceId" = ${resourceId}
    ORDER BY ${CATALOG_TIMELINE_ORDER_SQL} LIMIT ${take}
  `),
};

export function summarizeCatalogFindingHistory(resourceType: CatalogResourceType, resourceId: string,
  snapshots: readonly DiffSnapshot[], comparisonLimit: number, historyExhausted: boolean): CatalogHistoricalFindingSummary {
  const ordered = [...snapshots].sort(compareTimelineEntries).slice(0, comparisonLimit + 1);
  const totals = new Map<CatalogComparisonFindingCode, CatalogHistoricalFindingSummaryItem>();
  let comparablePairCount = 0; let truncatedComparisonCount = 0;
  for (let index = 0; index + 1 < ordered.length; index += 1) {
    const current = ordered[index]!; const previous = ordered[index + 1]!;
    const lifecycle = catalogComparableLifecycle(current, previous);
    if (!lifecycle.comparable) continue;
    comparablePairCount += 1;
    const analysis = analyzeCatalogComparison(resourceType, lifecycle.previousState, lifecycle.currentState);
    if (analysis.structural.truncated) truncatedComparisonCount += 1;
    const findings = analysis.findings;
    for (const finding of findings) {
      const total = totals.get(finding.code) ?? {code: finding.code, label: finding.label, comparisonCount: 0,
        evidenceCount: 0, occurrences: []};
      total.occurrences.push({currentSnapshotId: current.id, previousSnapshotId: previous.id,
        currentEffectiveAt: effectiveEventTime(current), previousEffectiveAt: effectiveEventTime(previous),
        evidenceCount: finding.evidenceCount, truncated: analysis.structural.truncated});
      total.comparisonCount = total.occurrences.length;
      total.evidenceCount += finding.evidenceCount;
      totals.set(finding.code, total);
    }
  }
  const adjacentPairCount = Math.max(0, ordered.length - 1);
  return {resourceType, resourceId, requestedComparisonLimit: comparisonLimit, snapshotCount: ordered.length,
    adjacentPairCount, comparablePairCount, skippedPairCount: adjacentPairCount - comparablePairCount,
    truncatedComparisonCount, findings: CATALOG_COMPARISON_FINDING_CODES.flatMap((code) => {
      const total = totals.get(code); return total ? [total] : [];
    }), historyExhausted};
}

export async function queryCatalogFindingHistory(shop: string, resourceType: string, resourceId: string,
  limit = DEFAULT_HISTORICAL_COMPARISON_LIMIT, source: CatalogFindingHistoryRepository = repository) {
  if (!shop || !resourceId || !Object.values(CatalogResourceType).includes(resourceType as CatalogResourceType)) return undefined;
  const comparisonLimit = normalizeHistoricalComparisonLimit(limit);
  const rows = await source.findRecent({shop, resourceType: resourceType as CatalogResourceType, resourceId,
    take: comparisonLimit + 2});
  return summarizeCatalogFindingHistory(resourceType as CatalogResourceType, resourceId, rows.slice(0, comparisonLimit + 1),
    comparisonLimit, rows.length <= comparisonLimit + 1);
}
