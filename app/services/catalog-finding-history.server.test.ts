import {CatalogResourceType} from "@prisma/client";
import {describe, expect, it, vi} from "vitest";
import {catalogComparableLifecycle, queryCatalogStructuralDiff, type DiffSnapshot} from "./catalog-diff.server";
import {DEFAULT_HISTORICAL_COMPARISON_LIMIT, MAX_HISTORICAL_COMPARISON_LIMIT,
  normalizeHistoricalComparisonLimit, queryCatalogFindingHistory, summarizeCatalogFindingHistory} from "./catalog-finding-history.server";

const at = (offset: number) => new Date(1_800_000_000_000 + offset);
const snapshot = (id: string, offset: number, state: unknown, overrides: Partial<DiffSnapshot> = {}): DiffSnapshot => ({
  id, resourceType: CatalogResourceType.PRODUCT, resourceId: "product-1", sourceTopic: "PRODUCTS_UPDATE",
  state: JSON.stringify(state), isDeleted: false, occurredAt: at(offset), receivedAt: at(offset), createdAt: at(offset), ...overrides,
});

describe("bounded historical finding summary", () => {
  it("normalizes default, maximum, and invalid limits deterministically", () => {
    expect(normalizeHistoricalComparisonLimit()).toBe(DEFAULT_HISTORICAL_COMPARISON_LIMIT);
    expect(normalizeHistoricalComparisonLimit(99)).toBe(MAX_HISTORICAL_COMPARISON_LIMIT);
    for (const value of [0, -1, 1.5, Number.NaN, Infinity, -Infinity])
      expect(normalizeHistoricalComparisonLimit(value)).toBe(DEFAULT_HISTORICAL_COMPARISON_LIMIT);
  });

  it("uses one exact, bounded repository query and reports lookahead exhaustion", async () => {
    const findRecent = vi.fn().mockResolvedValue([snapshot("new", 2, {}), snapshot("old", 1, {})]);
    const result = await queryCatalogFindingHistory("one.myshopify.com", "PRODUCT", "product-1", 4, {findRecent});
    expect(findRecent).toHaveBeenCalledOnce();
    expect(findRecent).toHaveBeenCalledWith({shop: "one.myshopify.com", resourceType: "PRODUCT", resourceId: "product-1", take: 6});
    expect(result?.historyExhausted).toBe(true);
    findRecent.mockResolvedValueOnce(Array.from({length: 6}, (_, index) => snapshot(String(index), 10 - index, {})));
    expect((await queryCatalogFindingHistory("one.myshopify.com", "PRODUCT", "product-1", 4, {findRecent}))?.historyExhausted).toBe(false);
  });

  it("rejects missing shop and invalid resources without querying", async () => {
    const findRecent = vi.fn(); const source = {findRecent};
    expect(await queryCatalogFindingHistory("", "PRODUCT", "product-1", 10, source)).toBeUndefined();
    expect(await queryCatalogFindingHistory("shop", "UNKNOWN", "product-1", 10, source)).toBeUndefined();
    expect(await queryCatalogFindingHistory("shop", "PRODUCT", "", 10, source)).toBeUndefined();
    expect(findRecent).not.toHaveBeenCalled();
  });

  it("normalizes input order, compares only adjacent pairs, and never bypasses a tombstone", () => {
    const oldest = snapshot("oldest", 1, {title: "A"});
    const tombstone = snapshot("middle", 2, {id: 1}, {sourceTopic: "PRODUCTS_DELETE", isDeleted: true});
    const newest = snapshot("newest", 3, {title: "C"});
    const input = [oldest, newest, tombstone]; const copy = [...input];
    const result = summarizeCatalogFindingHistory("PRODUCT", "product-1", input, 10, true);
    expect(result).toMatchObject({snapshotCount: 3, adjacentPairCount: 2, comparablePairCount: 0, skippedPairCount: 2});
    expect(result.occurrences).toEqual([]); expect(input).toEqual(copy);
  });

  it("aggregates comparison counts separately from repeated evidence in fixed order", () => {
    const rows = [
      snapshot("three", 3, {title: "C", variants: [{price: "3"}, {price: "4"}]}),
      snapshot("two", 2, {title: "B", variants: [{price: "2"}, {price: "3"}]}),
      snapshot("one", 1, {title: "A", variants: [{price: "1"}, {price: "2"}]}),
    ];
    const result = summarizeCatalogFindingHistory("PRODUCT", "product-1", rows, 10, true);
    expect(result.comparablePairCount).toBe(2);
    expect(result.findings.map(({code}) => code)).toEqual(["PRODUCT_IDENTITY_CHANGED", "VARIANT_PRICING_CHANGED"]);
    expect(result.findings[0]).toMatchObject({comparisonCount: 2, evidenceCount: 2});
    expect(result.findings[1]).toMatchObject({comparisonCount: 2, evidenceCount: 4});
    expect(result.occurrences.map(({currentSnapshotId, previousSnapshotId}) => [currentSnapshotId, previousSnapshotId]))
      .toEqual([["three", "two"], ["two", "one"]]);
  });

  it("keeps structurally truncated comparisons and their returned findings", () => {
    const variants = Array.from({length: 250}, (_, index) => ({price: String(index + 1)}));
    const previous = Array.from({length: 250}, (_, index) => ({price: String(index)}));
    const result = summarizeCatalogFindingHistory("PRODUCT", "product-1",
      [snapshot("new", 2, {variants}), snapshot("old", 1, {variants: previous})], 10, true);
    expect(result).toMatchObject({comparablePairCount: 1, truncatedComparisonCount: 1});
    expect(result.occurrences[0]?.truncated).toBe(true);
    expect(result.findings).toContainEqual(expect.objectContaining({code: "VARIANT_PRICING_CHANGED", comparisonCount: 1}));
  });

  it("fails closed for unsupported lifecycle, inconsistent deletion, creation, and invalid JSON", () => {
    const previous = snapshot("old", 1, {});
    const invalid = [
      snapshot("unsupported", 2, {}, {sourceTopic: "INVENTORY_UPDATE"}),
      snapshot("inconsistent", 2, {}, {isDeleted: true}),
      snapshot("create", 2, {}, {sourceTopic: "PRODUCTS_CREATE"}),
      snapshot("json", 2, {}, {state: "{"}),
    ];
    for (const current of invalid) expect(catalogComparableLifecycle(current, previous).comparable).toBe(false);
  });

  it("shares eligibility with the individual structural comparison", async () => {
    const current = snapshot("new", 2, {title: "B"}); const previous = snapshot("old", 1, {title: "A"});
    const diff = await queryCatalogStructuralDiff("shop", "PRODUCT", "product-1", "new", {
      findCurrent: vi.fn().mockResolvedValue(current), findPrevious: vi.fn().mockResolvedValue(previous),
    });
    expect(catalogComparableLifecycle(current, previous).comparable).toBe(true);
    expect(diff?.status).toBe("COMPARABLE");
  });
});
