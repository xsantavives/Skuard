import {CatalogResourceType, Prisma} from "@prisma/client";
import {prisma} from "../db.server";
import {
  CATALOG_COMPARISON_FINDING_CODES,
  type CatalogComparisonFinding,
  type CatalogComparisonFindingCode,
} from "./catalog-comparison-findings";
import {
  catalogComparableLifecycle,
  type DiffSnapshot,
} from "./catalog-diff.server";
import {analyzeCatalogComparison} from "./catalog-comparison-analysis";
import {
  compareTimelineEntries,
  effectiveEventTime,
  type CatalogTimelineCursor,
} from "./catalog-timeline.server";

export const DEFAULT_CATALOG_DETECTION_CANDIDATE_LIMIT = 25;
export const MAX_CATALOG_DETECTION_CANDIDATE_LIMIT = 50;
export const DEFAULT_CATALOG_DETECTION_OCCURRENCE_LIMIT = 5;
export const MAX_CATALOG_DETECTION_OCCURRENCE_LIMIT = 10;

export interface CatalogDetectionOverviewFilters {
  resourceType?: CatalogResourceType;
  findingCode?: CatalogComparisonFindingCode;
}

export interface CatalogDetectionOverviewOccurrence {
  currentSnapshotId: string;
  resourceType: CatalogResourceType;
  resourceId: string;
  effectiveAt: Date;
  returnedEvidenceCount: number;
  structurallyTruncated: boolean;
}

type OrderedOccurrence = CatalogDetectionOverviewOccurrence & {
  receivedAt: Date;
  createdAt: Date;
};

export interface CatalogDetectionOverviewGroup {
  code: CatalogComparisonFindingCode;
  label: string;
  comparisonCount: number;
  distinctResourceCount: number;
  returnedEvidenceCount: number;
  structurallyTruncatedComparisonCount: number;
  latestOccurrence: CatalogDetectionOverviewOccurrence;
  occurrences: CatalogDetectionOverviewOccurrence[];
  occurrencesTruncated: boolean;
}

export interface CatalogDetectionOverviewPage {
  candidateCount: number;
  comparableCount: number;
  skippedCount: number;
  groups: CatalogDetectionOverviewGroup[];
  hasNextPage: boolean;
  nextCursor?: string;
}

export interface CatalogDetectionPair {
  current: DiffSnapshot;
  previous: DiffSnapshot | null;
}

export type CatalogComparisonObservation =
  | {
      status: "COMPARABLE";
      currentSnapshotId: string;
      previousSnapshotId: string;
      resourceType: CatalogResourceType;
      resourceId: string;
      effectiveAt: Date;
      receivedAt: Date;
      createdAt: Date;
      findings: CatalogComparisonFinding[];
      structurallyTruncated: boolean;
    }
  | {status: "SKIPPED"; currentSnapshotId: string};

export interface CatalogDetectionOverviewRepository {
  findRecentPairs(input: {
    shop: string;
    take: number;
    before?: CatalogTimelineCursor;
    resourceType?: CatalogResourceType;
  }): Promise<CatalogDetectionPair[]>;
}

const normalizePositiveLimit = (value: number | undefined, fallback: number, maximum: number) =>
  Number.isInteger(value) && value! > 0 ? Math.min(value!, maximum) : fallback;

export const normalizeCatalogDetectionCandidateLimit = (value?: number) =>
  normalizePositiveLimit(value, DEFAULT_CATALOG_DETECTION_CANDIDATE_LIMIT, MAX_CATALOG_DETECTION_CANDIDATE_LIMIT);
export const normalizeCatalogDetectionOccurrenceLimit = (value?: number) =>
  normalizePositiveLimit(value, DEFAULT_CATALOG_DETECTION_OCCURRENCE_LIMIT, MAX_CATALOG_DETECTION_OCCURRENCE_LIMIT);

const singleBoundedValue = (params: URLSearchParams, name: string, maximum = 128) => {
  const values = params.getAll(name);
  return values.length === 1 && values[0] && values[0]!.length <= maximum ? values[0] : undefined;
};

export function parseCatalogDetectionOverviewFilters(params: URLSearchParams): CatalogDetectionOverviewFilters {
  const resourceType = singleBoundedValue(params, "resourceType");
  const findingCode = singleBoundedValue(params, "findingCode");
  return {
    ...(Object.values(CatalogResourceType).includes(resourceType as CatalogResourceType)
      ? {resourceType: resourceType as CatalogResourceType} : {}),
    ...(CATALOG_COMPARISON_FINDING_CODES.includes(findingCode as CatalogComparisonFindingCode)
      ? {findingCode: findingCode as CatalogComparisonFindingCode} : {}),
  };
}

export function encodeCatalogDetectionOverviewCursor(snapshot: DiffSnapshot) {
  return Buffer.from(JSON.stringify({
    effectiveAt: effectiveEventTime(snapshot).toISOString(),
    receivedAt: snapshot.receivedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    id: snapshot.id,
  } satisfies CatalogTimelineCursor), "utf8").toString("base64url");
}

export function decodeCatalogDetectionOverviewCursor(value?: string | null): CatalogTimelineCursor | undefined {
  if (!value || value.length > 2048) return undefined;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Partial<CatalogTimelineCursor>;
    if (typeof parsed.id !== "string" || !parsed.id || typeof parsed.effectiveAt !== "string" ||
      typeof parsed.receivedAt !== "string" || typeof parsed.createdAt !== "string" ||
      [parsed.effectiveAt, parsed.receivedAt, parsed.createdAt].some((date) => Number.isNaN(new Date(date).valueOf())))
      return undefined;
    return parsed as CatalogTimelineCursor;
  } catch { return undefined; }
}

type PairRow = DiffSnapshot & {
  previousId: string | null; previousResourceType: CatalogResourceType | null; previousResourceId: string | null;
  previousSourceTopic: string | null; previousState: string | null; previousIsDeleted: boolean | null;
  previousOccurredAt: Date | null; previousReceivedAt: Date | null; previousCreatedAt: Date | null;
};

const tupleBeforeSql = (alias: string, cursor: CatalogTimelineCursor) => {
  const column = (name: string) => Prisma.raw(`${alias}."${name}"`);
  const event = Prisma.sql`COALESCE(${column("occurredAt")}, ${column("receivedAt")})`;
  const effective = new Date(cursor.effectiveAt); const received = new Date(cursor.receivedAt);
  const created = new Date(cursor.createdAt);
  return Prisma.sql`(${event} < ${effective} OR (${event} = ${effective} AND ${column("receivedAt")} < ${received}) OR
    (${event} = ${effective} AND ${column("receivedAt")} = ${received} AND ${column("createdAt")} < ${created}) OR
    (${event} = ${effective} AND ${column("receivedAt")} = ${received} AND ${column("createdAt")} = ${created} AND ${column("id")} < ${cursor.id}))`;
};

export const catalogDetectionOverviewRepository: CatalogDetectionOverviewRepository = {
  async findRecentPairs({shop, take, before, resourceType}) {
    const cursor = before ? Prisma.sql`AND ${tupleBeforeSql("c", before)}` : Prisma.empty;
    const typeFilter = resourceType ? Prisma.sql`AND c."resourceType" = ${resourceType}` : Prisma.empty;
    const rows = await prisma.$queryRaw<PairRow[]>(Prisma.sql`
      WITH recent_current AS (
        SELECT c."id", c."resourceType", c."resourceId", c."sourceTopic", c."state", c."isDeleted", c."occurredAt", c."receivedAt", c."createdAt"
        FROM "CatalogSnapshot" c WHERE c."shop" = ${shop} ${typeFilter} ${cursor}
        ORDER BY COALESCE(c."occurredAt", c."receivedAt") DESC, c."receivedAt" DESC, c."createdAt" DESC, c."id" DESC LIMIT ${take}
      )
      SELECT c.*, p."id" AS "previousId", p."resourceType" AS "previousResourceType", p."resourceId" AS "previousResourceId",
        p."sourceTopic" AS "previousSourceTopic", p."state" AS "previousState", p."isDeleted" AS "previousIsDeleted",
        p."occurredAt" AS "previousOccurredAt", p."receivedAt" AS "previousReceivedAt", p."createdAt" AS "previousCreatedAt"
      FROM recent_current c LEFT JOIN "CatalogSnapshot" p ON p."shop" = ${shop} AND p."id" = (
        SELECT prior."id" FROM "CatalogSnapshot" prior WHERE prior."shop" = ${shop}
          AND prior."resourceType" = c."resourceType" AND prior."resourceId" = c."resourceId" AND (
            COALESCE(prior."occurredAt", prior."receivedAt") < COALESCE(c."occurredAt", c."receivedAt") OR
            (COALESCE(prior."occurredAt", prior."receivedAt") = COALESCE(c."occurredAt", c."receivedAt") AND prior."receivedAt" < c."receivedAt") OR
            (COALESCE(prior."occurredAt", prior."receivedAt") = COALESCE(c."occurredAt", c."receivedAt") AND prior."receivedAt" = c."receivedAt" AND prior."createdAt" < c."createdAt") OR
            (COALESCE(prior."occurredAt", prior."receivedAt") = COALESCE(c."occurredAt", c."receivedAt") AND prior."receivedAt" = c."receivedAt" AND prior."createdAt" = c."createdAt" AND prior."id" < c."id"))
        ORDER BY COALESCE(prior."occurredAt", prior."receivedAt") DESC, prior."receivedAt" DESC, prior."createdAt" DESC, prior."id" DESC LIMIT 1)
      ORDER BY COALESCE(c."occurredAt", c."receivedAt") DESC, c."receivedAt" DESC, c."createdAt" DESC, c."id" DESC
    `);
    return rows.map((row) => ({current: row, previous: row.previousId ? {
      id: row.previousId, resourceType: row.previousResourceType!, resourceId: row.previousResourceId!, sourceTopic: row.previousSourceTopic!,
      state: row.previousState!, isDeleted: row.previousIsDeleted!, occurredAt: row.previousOccurredAt,
      receivedAt: row.previousReceivedAt!, createdAt: row.previousCreatedAt!,
    } : null}));
  },
};


export function observeCatalogComparisons(pairs: readonly CatalogDetectionPair[]): CatalogComparisonObservation[] {
  return [...pairs].sort((a, b) => compareTimelineEntries(a.current, b.current)).map(({current, previous}) => {
    if (!previous) return {status: "SKIPPED", currentSnapshotId: current.id};
    const lifecycle = catalogComparableLifecycle(current, previous);
    if (!lifecycle.comparable) return {status: "SKIPPED", currentSnapshotId: current.id};
    const analysis = analyzeCatalogComparison(current.resourceType, lifecycle.previousState, lifecycle.currentState);
    return {status: "COMPARABLE", currentSnapshotId: current.id, previousSnapshotId: previous.id,
      resourceType: current.resourceType, resourceId: current.resourceId, effectiveAt: effectiveEventTime(current),
      receivedAt: current.receivedAt, createdAt: current.createdAt,
      findings: analysis.findings,
      structurallyTruncated: analysis.structural.truncated} satisfies CatalogComparisonObservation;
  });
}

const compareOccurrences = (a: OrderedOccurrence, b: OrderedOccurrence) => compareTimelineEntries(
  {id: a.currentSnapshotId, occurredAt: a.effectiveAt, receivedAt: a.receivedAt, createdAt: a.createdAt},
  {id: b.currentSnapshotId, occurredAt: b.effectiveAt, receivedAt: b.receivedAt, createdAt: b.createdAt},
);
const publicOccurrence = ({receivedAt: _receivedAt, createdAt: _createdAt, ...value}: OrderedOccurrence) => value;

export function aggregateCatalogDetectionOverview(observations: readonly CatalogComparisonObservation[],
  occurrenceLimit = DEFAULT_CATALOG_DETECTION_OCCURRENCE_LIMIT) {
  const limit = normalizeCatalogDetectionOccurrenceLimit(occurrenceLimit);
  const totals = new Map<CatalogComparisonFindingCode, {label: string; occurrences: OrderedOccurrence[]; resources: Set<string>}>();
  for (const observation of observations) {
    if (observation.status !== "COMPARABLE") continue;
    const byCode = new Map(observation.findings.map((finding) => [finding.code, finding]));
    for (const finding of byCode.values()) {
      const total = totals.get(finding.code) ?? {label: finding.label, occurrences: [], resources: new Set<string>()};
      total.resources.add(JSON.stringify([observation.resourceType, observation.resourceId]));
      total.occurrences.push({currentSnapshotId: observation.currentSnapshotId, resourceType: observation.resourceType,
        resourceId: observation.resourceId, effectiveAt: observation.effectiveAt, receivedAt: observation.receivedAt,
        createdAt: observation.createdAt, returnedEvidenceCount: finding.evidenceCount,
        structurallyTruncated: observation.structurallyTruncated});
      totals.set(finding.code, total);
    }
  }
  const latest = new Map<CatalogComparisonFindingCode, OrderedOccurrence>();
  const groups = CATALOG_COMPARISON_FINDING_CODES.flatMap((code) => {
    const total = totals.get(code); if (!total) return [];
    const ordered = [...total.occurrences].sort(compareOccurrences);
    latest.set(code, ordered[0]!);
    return [{code, label: total.label, comparisonCount: ordered.length, distinctResourceCount: total.resources.size,
      returnedEvidenceCount: ordered.reduce((sum, item) => sum + item.returnedEvidenceCount, 0),
      structurallyTruncatedComparisonCount: ordered.filter((item) => item.structurallyTruncated).length,
      latestOccurrence: publicOccurrence(ordered[0]!), occurrences: ordered.slice(0, limit).map(publicOccurrence),
      occurrencesTruncated: ordered.length > limit} satisfies CatalogDetectionOverviewGroup];
  });
  return groups.sort((a, b) => compareOccurrences(latest.get(a.code)!, latest.get(b.code)!) ||
    CATALOG_COMPARISON_FINDING_CODES.indexOf(a.code) - CATALOG_COMPARISON_FINDING_CODES.indexOf(b.code));
}

export async function queryCatalogDetectionOverview(shop: string, options: {limit?: number; occurrenceLimit?: number;
  cursor?: string | null; filters?: CatalogDetectionOverviewFilters} = {},
repository: CatalogDetectionOverviewRepository = catalogDetectionOverviewRepository): Promise<CatalogDetectionOverviewPage> {
  const limit = normalizeCatalogDetectionCandidateLimit(options.limit);
  const pairs = await repository.findRecentPairs({shop, take: limit + 1,
    before: decodeCatalogDetectionOverviewCursor(options.cursor), resourceType: options.filters?.resourceType});
  const ordered = [...pairs].sort((a, b) => compareTimelineEntries(a.current, b.current));
  const candidates = ordered.slice(0, limit); const observations = observeCatalogComparisons(candidates);
  const comparableCount = observations.filter((item) => item.status === "COMPARABLE").length;
  const hasNextPage = ordered.length > limit;
  const groups = aggregateCatalogDetectionOverview(observations, options.occurrenceLimit)
    .filter((group) => !options.filters?.findingCode || group.code === options.filters.findingCode);
  return {candidateCount: candidates.length, comparableCount, skippedCount: candidates.length - comparableCount,
    groups,
    hasNextPage, ...(hasNextPage && candidates.length ? {nextCursor: encodeCatalogDetectionOverviewCursor(candidates.at(-1)!.current)} : {})};
}
