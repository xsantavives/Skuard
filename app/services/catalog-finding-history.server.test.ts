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
    expect(result.findings).toEqual([]); expect(input).toEqual(copy);
  });

  it("aggregates comparison counts separately from repeated evidence in fixed order", () => {
    const rows = [
      snapshot("three", 3, {title: "C", variants: [{id: 1, price: "3", compare_at_price: null}, {id: 2, price: "4", compare_at_price: null}]}),
      snapshot("two", 2, {title: "B", variants: [{id: 1, price: "2", compare_at_price: null}, {id: 2, price: "3", compare_at_price: null}]}),
      snapshot("one", 1, {title: "A", variants: [{id: 1, price: "1", compare_at_price: null}, {id: 2, price: "2", compare_at_price: null}]}),
    ];
    const result = summarizeCatalogFindingHistory("PRODUCT", "product-1", rows, 10, true);
    expect(result.comparablePairCount).toBe(2);
    expect(result.findings.map(({code}) => code)).toEqual(["PRODUCT_IDENTITY_CHANGED", "VARIANT_PRICING_CHANGED"]);
    expect(result.findings[0]).toMatchObject({comparisonCount: 2, evidenceCount: 2});
    expect(result.findings[1]).toMatchObject({comparisonCount: 2, evidenceCount: 4});
    expect(result.findings[1]!.occurrences.map(({currentSnapshotId, previousSnapshotId}) => [currentSnapshotId, previousSnapshotId]))
      .toEqual([["three", "two"], ["two", "one"]]);
    for (const finding of result.findings) {
      expect(finding.comparisonCount).toBe(finding.occurrences.length);
      expect(finding.evidenceCount).toBe(finding.occurrences.reduce((sum, occurrence) => sum + occurrence.evidenceCount, 0));
      expect(new Set(finding.occurrences.map(({currentSnapshotId}) => currentSnapshotId)).size).toBe(finding.occurrences.length);
    }
  });

  it("keeps structurally truncated comparisons and their returned findings", () => {
    const variants = Array.from({length: 250}, (_, index) => ({id: index, price: String(index + 1), compare_at_price: null}));
    const previous = Array.from({length: 250}, (_, index) => ({id: index, price: String(index), compare_at_price: null}));
    const result = summarizeCatalogFindingHistory("PRODUCT", "product-1",
      [snapshot("new", 2, {variants}), snapshot("old", 1, {variants: previous})], 10, true);
    expect(result).toMatchObject({comparablePairCount: 1, truncatedComparisonCount: 1});
    const finding = result.findings.find(({code}) => code === "VARIANT_PRICING_CHANGED");
    expect(finding).toMatchObject({comparisonCount: 1, evidenceCount: 200});
    expect(finding?.occurrences).toEqual([expect.objectContaining({currentSnapshotId: "new", previousSnapshotId: "old",
      evidenceCount: 200, truncated: true})]);
  });

  it("keeps atomic and combination occurrences independent and preserves comparison order over evidence count", () => {
    const input = [
      snapshot("new", 3, {title: "C", status: "ACTIVE", variants: [{id: 1, price: "3", compare_at_price: null}]}),
      snapshot("middle", 2, {title: "B", status: "DRAFT", variants: [{id: 1, price: "1", compare_at_price: null}, {id: 2, price: "2", compare_at_price: null}]}),
      snapshot("old", 1, {title: "A", status: "DRAFT", variants: [{id: 1, price: "0", compare_at_price: null}, {id: 2, price: "1", compare_at_price: null}]}),
    ];
    const copy = structuredClone(input);
    const first = summarizeCatalogFindingHistory("PRODUCT", "product-1", input, 10, true);
    const reversed = summarizeCatalogFindingHistory("PRODUCT", "product-1", [...input].reverse(), 10, true);
    expect(first).toEqual(reversed);
    expect(JSON.stringify(summarizeCatalogFindingHistory("PRODUCT", "product-1", input, 10, true))).toBe(JSON.stringify(first));
    expect(input).toEqual(copy);
    expect(first.findings.map(({code}) => code)).toEqual([
      "PRODUCT_IDENTITY_CHANGED", "PRODUCT_PUBLICATION_CHANGED", "VARIANT_PRICING_CHANGED",
      "PRODUCT_IDENTITY_AND_PUBLICATION_CHANGED",
    ]);
    const identity = first.findings[0]!;
    expect(identity.occurrences.map(({currentSnapshotId, evidenceCount}) => [currentSnapshotId, evidenceCount]))
      .toEqual([["new", 1], ["middle", 1]]);
    expect(first.findings.at(-1)?.occurrences).toHaveLength(1);
  });

  it("uses timeline tie-breakers for newest-first occurrences and bounds each finding by the comparison limit", () => {
    const same = at(1);
    const rows = Array.from({length: 22}, (_, index) => snapshot(String(index).padStart(2, "0"), 1,
      {title: String(index)}, {occurredAt: same, receivedAt: same, createdAt: same}));
    const result = summarizeCatalogFindingHistory("PRODUCT", "product-1", rows, MAX_HISTORICAL_COMPARISON_LIMIT, false);
    expect(result.findings[0]?.occurrences).toHaveLength(MAX_HISTORICAL_COMPARISON_LIMIT);
    expect(result.findings[0]?.occurrences.map(({currentSnapshotId}) => currentSnapshotId))
      .toEqual(Array.from({length: 20}, (_, index) => String(21 - index).padStart(2, "0")));
  });

  it("counts comparable zero-finding comparisons without creating occurrences", () => {
    const result = summarizeCatalogFindingHistory("PRODUCT", "product-1",
      [snapshot("new", 2, {updated_at: "B"}), snapshot("old", 1, {updated_at: "A"})], 10, true);
    expect(result.comparablePairCount).toBe(1);
    expect(result.findings).toEqual([]);
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
