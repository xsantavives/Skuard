import {CatalogResourceType} from "@prisma/client";
import {describe, expect, it, vi} from "vitest";
import {prisma} from "../db.server";
import {
  aggregateCatalogDetectionOverview,
  catalogDetectionOverviewRepository,
  decodeCatalogDetectionOverviewCursor,
  encodeCatalogDetectionOverviewCursor,
  normalizeCatalogDetectionCandidateLimit,
  normalizeCatalogDetectionOccurrenceLimit,
  observeCatalogComparisons,
  parseCatalogDetectionOverviewFilters,
  queryCatalogDetectionOverview,
  type CatalogComparisonObservation,
  type CatalogDetectionPair,
} from "./catalog-detection-overview.server";

const at = (day: number, suffix = "12:00:00.000Z") => new Date(`2026-07-${String(day).padStart(2, "0")}T${suffix}`);
const snapshot = (id: string, day: number, state: object | string, options: {resourceType?: CatalogResourceType;
  resourceId?: string; topic?: string; deleted?: boolean; receivedAt?: Date; createdAt?: Date} = {}) => ({
  id, resourceType: options.resourceType ?? CatalogResourceType.PRODUCT, resourceId: options.resourceId ?? "product-1",
  sourceTopic: options.topic ?? "PRODUCTS_UPDATE", state: typeof state === "string" ? state : JSON.stringify(state),
  isDeleted: options.deleted ?? false, occurredAt: at(day), receivedAt: options.receivedAt ?? at(day),
  createdAt: options.createdAt ?? at(day),
});
const pair = (id: string, day: number, current: object, previous: object, options = {}): CatalogDetectionPair => ({
  current: snapshot(id, day, current, options), previous: snapshot(`${id}-previous`, day - 1, previous, options),
});
const finding = (code: "PRODUCT_IDENTITY_CHANGED" | "PRODUCT_PUBLICATION_CHANGED", label: string, evidenceCount: number) =>
  ({code, label, evidenceCount, evidenceSignalCodes: []});
const observation = (id: string, day: number, options: {resourceType?: CatalogResourceType; resourceId?: string;
  receivedAt?: Date; createdAt?: Date; findings?: ReturnType<typeof finding>[]; truncated?: boolean} = {}): CatalogComparisonObservation => ({
  status: "COMPARABLE", currentSnapshotId: id, previousSnapshotId: `${id}-previous`,
  resourceType: options.resourceType ?? CatalogResourceType.PRODUCT, resourceId: options.resourceId ?? "same",
  effectiveAt: at(day), receivedAt: options.receivedAt ?? at(day), createdAt: options.createdAt ?? at(day),
  findings: options.findings ?? [finding("PRODUCT_IDENTITY_CHANGED", "Identity", 1)],
  structurallyTruncated: options.truncated ?? false,
});

describe("catalog detection overview aggregation", () => {
  it("is deterministic for shuffled input and does not mutate input", () => {
    const input = [observation("older", 20), observation("newer", 21)];
    const copy = [...input];
    const result = aggregateCatalogDetectionOverview(input);
    expect(input).toEqual(copy);
    expect(result).toEqual(aggregateCatalogDetectionOverview([...input].reverse()));
    expect(result[0]!.occurrences.map((item) => item.currentSnapshotId)).toEqual(["newer", "older"]);
  });

  it("counts exact comparisons, collision-safe distinct resources, evidence, and structural truncation", () => {
    const result = aggregateCatalogDetectionOverview([
      observation("p1", 24, {resourceId: "shared", findings: [finding("PRODUCT_IDENTITY_CHANGED", "Identity", 2)]}),
      observation("p2", 23, {resourceId: "shared", truncated: true}),
      observation("c1", 22, {resourceType: CatalogResourceType.COLLECTION, resourceId: "shared"}),
    ])[0]!;
    expect(result).toMatchObject({comparisonCount: 3, distinctResourceCount: 2,
      returnedEvidenceCount: 4, structurallyTruncatedComparisonCount: 1});
  });

  it("supports multiple findings and fixed-code group ordering when latest tuples tie", () => {
    const result = aggregateCatalogDetectionOverview([
      observation("same", 20, {findings: [finding("PRODUCT_PUBLICATION_CHANGED", "Publication", 1),
        finding("PRODUCT_IDENTITY_CHANGED", "Identity", 1)]}),
    ]);
    expect(result.map((item) => item.code)).toEqual(["PRODUCT_IDENTITY_CHANGED", "PRODUCT_PUBLICATION_CHANGED"]);
  });

  it("uses received, created, and snapshot ID tie breakers and bounds occurrences", () => {
    const effective = 20;
    const values = [
      observation("a", effective, {receivedAt: at(20, "13:00:00.000Z")}),
      observation("z", effective, {receivedAt: at(20, "13:00:00.000Z"), createdAt: at(20, "14:00:00.000Z")}),
      observation("y", effective, {receivedAt: at(20, "13:00:00.000Z"), createdAt: at(20, "14:00:00.000Z")}),
      observation("old-received", effective, {receivedAt: at(20, "11:00:00.000Z")}),
    ];
    const result = aggregateCatalogDetectionOverview(values, 2)[0]!;
    expect(result.latestOccurrence.currentSnapshotId).toBe("z");
    expect(result.occurrences.map((item) => item.currentSnapshotId)).toEqual(["z", "y"]);
    expect(result.occurrencesTruncated).toBe(true);
  });

  it("does not mark an occurrence list truncated when it is exactly at the limit", () => {
    const result = aggregateCatalogDetectionOverview([
      observation("newer", 21), observation("older", 20),
    ], 2)[0]!;
    expect(result.comparisonCount).toBe(2);
    expect(result.occurrences).toHaveLength(2);
    expect(result.occurrencesTruncated).toBe(false);
  });

  it("returns empty output and normalizes occurrence bounds", () => {
    expect(aggregateCatalogDetectionOverview([])).toEqual([]);
    expect(normalizeCatalogDetectionOccurrenceLimit()).toBe(5);
    expect(normalizeCatalogDetectionOccurrenceLimit(99)).toBe(10);
    expect(normalizeCatalogDetectionOccurrenceLimit(0)).toBe(5);
  });
});

describe("catalog detection overview service", () => {
  it("builds one bounded read with shop-scoped current and exact same-resource predecessor selection", async () => {
    const query = vi.spyOn(prisma, "$queryRaw").mockResolvedValueOnce([]);
    await catalogDetectionOverviewRepository.findRecentPairs({shop: "isolated.myshopify.com", take: 26,
      resourceType: CatalogResourceType.PRODUCT, before: {effectiveAt: at(20).toISOString(),
        receivedAt: at(20).toISOString(), createdAt: at(20).toISOString(), id: "cursor-id"}});
    expect(query).toHaveBeenCalledOnce();
    const sql = query.mock.calls[0]![0] as {strings: readonly string[]; values: readonly unknown[]};
    const text = sql.strings.join("?");
    expect(text).toContain('c."shop" = ?');
    expect(text).toContain('p."shop" = ?');
    expect(text).toContain('prior."shop" = ?');
    expect(text).toContain('prior."resourceType" = c."resourceType"');
    expect(text).toContain('prior."resourceId" = c."resourceId"');
    expect(text).toContain('ORDER BY COALESCE(prior."occurredAt", prior."receivedAt") DESC');
    expect(text).toContain('prior."receivedAt" = c."receivedAt" AND prior."createdAt" = c."createdAt" AND prior."id" < c."id"');
    expect(text).not.toContain('prior."isDeleted"');
    expect(text).toContain("LIMIT ?");
    expect(text).not.toMatch(/\b(INSERT|UPDATE|DELETE)\b/i);
    expect(sql.values.filter((value) => value === "isolated.myshopify.com")).toHaveLength(3);
    expect(sql.values).toContain(26);
    query.mockRestore();
  });

  it("uses one bounded authenticated-shop repository call with allow-listed resource filtering", async () => {
    const findRecentPairs = vi.fn().mockResolvedValue([]);
    await queryCatalogDetectionOverview("one.myshopify.com", {limit: 50,
      filters: {resourceType: CatalogResourceType.COLLECTION}}, {findRecentPairs});
    expect(findRecentPairs).toHaveBeenCalledOnce();
    expect(findRecentPairs).toHaveBeenCalledWith({shop: "one.myshopify.com", take: 51,
      before: undefined, resourceType: CatalogResourceType.COLLECTION});
  });

  it("normalizes limits, filters, malformed values, duplicates, and case", () => {
    expect(normalizeCatalogDetectionCandidateLimit()).toBe(25);
    expect(normalizeCatalogDetectionCandidateLimit(99)).toBe(50);
    for (const value of [0, -1, 1.5, Number.NaN]) expect(normalizeCatalogDetectionCandidateLimit(value)).toBe(25);
    expect(parseCatalogDetectionOverviewFilters(new URLSearchParams("resourceType=PRODUCT&findingCode=PRODUCT_IDENTITY_CHANGED")))
      .toEqual({resourceType: CatalogResourceType.PRODUCT, findingCode: "PRODUCT_IDENTITY_CHANGED"});
    for (const query of ["resourceType=product", "resourceType=PRODUCT&resourceType=COLLECTION",
      `findingCode=${"x".repeat(129)}`, "findingCode=unknown", "findingCode="])
      expect(parseCatalogDetectionOverviewFilters(new URLSearchParams(query))).toEqual({});
  });

  it("round trips a bounded shop-free full tuple cursor and rejects malformed cursors", () => {
    const current = snapshot("tuple", 20, {}, {receivedAt: at(20, "13:00:00.000Z"), createdAt: at(20, "14:00:00.000Z")});
    const encoded = encodeCatalogDetectionOverviewCursor(current);
    expect(decodeCatalogDetectionOverviewCursor(encoded)).toEqual({effectiveAt: at(20).toISOString(),
      receivedAt: at(20, "13:00:00.000Z").toISOString(), createdAt: at(20, "14:00:00.000Z").toISOString(), id: "tuple"});
    expect(Buffer.from(encoded, "base64url").toString()).not.toContain("shop");
    expect(decodeCatalogDetectionOverviewCursor("bad")).toBeUndefined();
    expect(decodeCatalogDetectionOverviewCursor("x".repeat(2049))).toBeUndefined();
    expect(decodeCatalogDetectionOverviewCursor(Buffer.from(JSON.stringify({effectiveAt: "invalid",
      receivedAt: at(20).toISOString(), createdAt: at(20).toISOString(), id: "x"})).toString("base64url")))
      .toBeUndefined();
  });

  it("analyzes only the normalized window without backfill and advances over skipped and zero-finding candidates", async () => {
    const skipped: CatalogDetectionPair = {current: snapshot("skipped", 23, {}, {topic: "PRODUCTS_CREATE"}), previous: null};
    const zero = pair("zero", 22, {updated_at: "new"}, {updated_at: "old"});
    const beyond = pair("beyond", 21, {title: "new"}, {title: "old"});
    const findRecentPairs = vi.fn().mockResolvedValue([beyond, zero, skipped]);
    const result = await queryCatalogDetectionOverview("shop", {limit: 2}, {findRecentPairs});
    expect(result).toMatchObject({candidateCount: 2, comparableCount: 1, skippedCount: 1, groups: [], hasNextPage: true});
    expect(decodeCatalogDetectionOverviewCursor(result.nextCursor)?.id).toBe("zero");
  });

  it("fails closed through the shared lifecycle gate and invalid JSON", () => {
    const cases: CatalogDetectionPair[] = [
      {current: snapshot("first", 20, {}), previous: null},
      {current: snapshot("create", 19, {}, {topic: "PRODUCTS_CREATE"}), previous: snapshot("old", 18, {})},
      {current: snapshot("delete", 17, {}, {topic: "PRODUCTS_DELETE", deleted: true}), previous: snapshot("old2", 16, {})},
      {current: snapshot("after-delete", 15, {}), previous: snapshot("tombstone", 14, {}, {topic: "PRODUCTS_DELETE", deleted: true})},
      {current: snapshot("unsupported", 13, {}, {topic: "ORDERS_UPDATE"}), previous: snapshot("old3", 12, {})},
      {current: snapshot("invalid", 11, "{"), previous: snapshot("old4", 10, {})},
    ];
    expect(observeCatalogComparisons(cases).every((item) => item.status === "SKIPPED")).toBe(true);
  });

  it("filters returned groups only while retaining page metadata", async () => {
    const findRecentPairs = vi.fn().mockResolvedValue([pair("both", 20,
      {title: "new", status: "active"}, {title: "old", status: "draft"})]);
    const result = await queryCatalogDetectionOverview("shop", {filters: {findingCode: "PRODUCT_PUBLICATION_CHANGED"}}, {findRecentPairs});
    expect(result).toMatchObject({candidateCount: 1, comparableCount: 1});
    expect(result.groups.map((group) => group.code)).toEqual(["PRODUCT_PUBLICATION_CHANGED"]);
  });
});
