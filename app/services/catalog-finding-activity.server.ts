import {CatalogResourceType, Prisma} from "@prisma/client";
import {prisma} from "../db.server";
import {
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

export const DEFAULT_CATALOG_FINDING_ACTIVITY_LIMIT = 25;
export const MAX_CATALOG_FINDING_ACTIVITY_LIMIT = 50;

export interface CatalogFindingActivityFinding {
  code: CatalogComparisonFindingCode;
  label: string;
  evidenceCount: number;
}
export interface CatalogFindingActivityEntry {
  currentSnapshotId: string;
  resourceType: CatalogResourceType;
  resourceId: string;
  currentEffectiveAt: Date;
  findings: CatalogFindingActivityFinding[];
  truncated: boolean;
}
export interface CatalogFindingActivityPage {
  candidateCount: number;
  comparableCount: number;
  skippedCount: number;
  findingBearingCount: number;
  entries: CatalogFindingActivityEntry[];
  hasNextPage: boolean;
  nextCursor?: string;
}
export interface CatalogFindingActivityPair {
  current: DiffSnapshot;
  previous: DiffSnapshot | null;
}
export interface CatalogFindingActivityRepository {
  findRecentPairs(input: {
    shop: string;
    take: number;
    before?: CatalogTimelineCursor;
  }): Promise<CatalogFindingActivityPair[]>;
}

export function normalizeCatalogFindingActivityLimit(
  limit = DEFAULT_CATALOG_FINDING_ACTIVITY_LIMIT,
) {
  return Number.isInteger(limit) && limit > 0
    ? Math.min(limit, MAX_CATALOG_FINDING_ACTIVITY_LIMIT)
    : DEFAULT_CATALOG_FINDING_ACTIVITY_LIMIT;
}

export function encodeCatalogFindingActivityCursor(snapshot: DiffSnapshot) {
  const cursor: CatalogTimelineCursor = {
    effectiveAt: effectiveEventTime(snapshot).toISOString(),
    receivedAt: snapshot.receivedAt.toISOString(),
    createdAt: snapshot.createdAt.toISOString(),
    id: snapshot.id,
  };
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeCatalogFindingActivityCursor(
  value?: string | null,
): CatalogTimelineCursor | undefined {
  if (!value || value.length > 2048) return undefined;
  try {
    const parsed = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8"),
    ) as Partial<CatalogTimelineCursor>;
    if (
      typeof parsed.id !== "string" ||
      !parsed.id ||
      typeof parsed.effectiveAt !== "string" ||
      typeof parsed.receivedAt !== "string" ||
      typeof parsed.createdAt !== "string"
    )
      return undefined;
    if (
      [parsed.effectiveAt, parsed.receivedAt, parsed.createdAt].some((date) =>
        Number.isNaN(new Date(date).valueOf()),
      )
    )
      return undefined;
    return parsed as CatalogTimelineCursor;
  } catch {
    return undefined;
  }
}

type PairRow = DiffSnapshot & {
  previousId: string | null;
  previousResourceType: CatalogResourceType | null;
  previousResourceId: string | null;
  previousSourceTopic: string | null;
  previousState: string | null;
  previousIsDeleted: boolean | null;
  previousOccurredAt: Date | null;
  previousReceivedAt: Date | null;
  previousCreatedAt: Date | null;
};
const beforeSql = (alias: string, cursor: CatalogTimelineCursor) => {
  const effective = new Date(cursor.effectiveAt);
  const received = new Date(cursor.receivedAt);
  const created = new Date(cursor.createdAt);
  const column = (name: string) => Prisma.raw(`${alias}."${name}"`);
  const event = Prisma.sql`COALESCE(${column("occurredAt")}, ${column("receivedAt")})`;
  return Prisma.sql`(${event} < ${effective} OR (${event} = ${effective} AND ${column("receivedAt")} < ${received}) OR
    (${event} = ${effective} AND ${column("receivedAt")} = ${received} AND ${column("createdAt")} < ${created}) OR
    (${event} = ${effective} AND ${column("receivedAt")} = ${received} AND ${column("createdAt")} = ${created} AND ${column("id")} < ${cursor.id}))`;
};

export const catalogFindingActivityRepository: CatalogFindingActivityRepository = {
  async findRecentPairs({shop, take, before}) {
    const cursor = before ? Prisma.sql`AND ${beforeSql("c", before)}` : Prisma.empty;
    const rows = await prisma.$queryRaw<PairRow[]>(Prisma.sql`
      WITH recent_current AS (
        SELECT c."id", c."resourceType", c."resourceId", c."sourceTopic", c."state", c."isDeleted",
          c."occurredAt", c."receivedAt", c."createdAt"
        FROM "CatalogSnapshot" c WHERE c."shop" = ${shop} ${cursor}
        ORDER BY COALESCE(c."occurredAt", c."receivedAt") DESC, c."receivedAt" DESC, c."createdAt" DESC, c."id" DESC
        LIMIT ${take}
      )
      SELECT c.*, p."id" AS "previousId", p."resourceType" AS "previousResourceType",
        p."resourceId" AS "previousResourceId", p."sourceTopic" AS "previousSourceTopic",
        p."state" AS "previousState", p."isDeleted" AS "previousIsDeleted",
        p."occurredAt" AS "previousOccurredAt", p."receivedAt" AS "previousReceivedAt",
        p."createdAt" AS "previousCreatedAt"
      FROM recent_current c LEFT JOIN "CatalogSnapshot" p ON p."shop" = ${shop} AND p."id" = (
        SELECT prior."id" FROM "CatalogSnapshot" prior
        WHERE prior."shop" = ${shop} AND prior."resourceType" = c."resourceType" AND prior."resourceId" = c."resourceId"
          AND (COALESCE(prior."occurredAt", prior."receivedAt") < COALESCE(c."occurredAt", c."receivedAt") OR
            (COALESCE(prior."occurredAt", prior."receivedAt") = COALESCE(c."occurredAt", c."receivedAt") AND prior."receivedAt" < c."receivedAt") OR
            (COALESCE(prior."occurredAt", prior."receivedAt") = COALESCE(c."occurredAt", c."receivedAt") AND prior."receivedAt" = c."receivedAt" AND prior."createdAt" < c."createdAt") OR
            (COALESCE(prior."occurredAt", prior."receivedAt") = COALESCE(c."occurredAt", c."receivedAt") AND prior."receivedAt" = c."receivedAt" AND prior."createdAt" = c."createdAt" AND prior."id" < c."id"))
        ORDER BY COALESCE(prior."occurredAt", prior."receivedAt") DESC, prior."receivedAt" DESC, prior."createdAt" DESC, prior."id" DESC LIMIT 1
      )
      ORDER BY COALESCE(c."occurredAt", c."receivedAt") DESC, c."receivedAt" DESC, c."createdAt" DESC, c."id" DESC
    `);
    return rows.map((row) => ({
      current: row,
      previous: row.previousId
        ? {
            id: row.previousId,
            resourceType: row.previousResourceType!,
            resourceId: row.previousResourceId!,
            sourceTopic: row.previousSourceTopic!,
            state: row.previousState!,
            isDeleted: row.previousIsDeleted!,
            occurredAt: row.previousOccurredAt,
            receivedAt: row.previousReceivedAt!,
            createdAt: row.previousCreatedAt!,
          }
        : null,
    }));
  },
};

export function deriveCatalogFindingActivity(
  pairs: readonly CatalogFindingActivityPair[],
  limit: number,
): CatalogFindingActivityPage {
  const ordered = [...pairs].sort((a, b) => compareTimelineEntries(a.current, b.current));
  const hasNextPage = ordered.length > limit;
  const candidates = ordered.slice(0, limit);
  const entries: CatalogFindingActivityEntry[] = [];
  let comparableCount = 0;
  for (const {current, previous} of candidates) {
    if (!previous) continue;
    const lifecycle = catalogComparableLifecycle(current, previous);
    if (!lifecycle.comparable) continue;
    comparableCount += 1;
    const analysis = analyzeCatalogComparison(current.resourceType, lifecycle.previousState, lifecycle.currentState);
    const findings = analysis.findings.map(({code, label, evidenceCount}) => ({code, label, evidenceCount}));
    if (findings.length)
      entries.push({
        currentSnapshotId: current.id,
        resourceType: current.resourceType,
        resourceId: current.resourceId,
        currentEffectiveAt: effectiveEventTime(current),
        findings,
        truncated: analysis.structural.truncated,
      });
  }
  const candidateCount = candidates.length;
  return {
    candidateCount,
    comparableCount,
    skippedCount: candidateCount - comparableCount,
    findingBearingCount: entries.length,
    entries,
    hasNextPage,
    ...(hasNextPage && candidates.length
      ? {nextCursor: encodeCatalogFindingActivityCursor(candidates.at(-1)!.current)}
      : {}),
  };
}

export async function queryCatalogFindingActivity(
  shop: string,
  options: {limit?: number; cursor?: string | null} = {},
  repository: CatalogFindingActivityRepository = catalogFindingActivityRepository,
) {
  const limit = normalizeCatalogFindingActivityLimit(options.limit);
  if (!shop) return deriveCatalogFindingActivity([], limit);
  const pairs = await repository.findRecentPairs({
    shop,
    take: limit + 1,
    before: decodeCatalogFindingActivityCursor(options.cursor),
  });
  return deriveCatalogFindingActivity(pairs, limit);
}
