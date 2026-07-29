import {describe, expect, it} from "vitest";
import {analyzeCatalogComparison, deriveVariantPricingEvidence} from "./catalog-comparison-analysis";
import type {JsonValue} from "./catalog-json.server";

const product = (variants: JsonValue[], variant_gids?: JsonValue[]): JsonValue => ({variants, ...(variant_gids ? {variant_gids} : {})});
const variant = (id: string | number, price = "10.00", compare_at_price: string | null = null, extra = {}) =>
  ({id, price, compare_at_price, ...extra});

describe("identity-aware variant pricing evidence", () => {
  it("detects price and compare-at transitions for the same identity", () => {
    const result = deriveVariantPricingEvidence(product([variant(1, "10", null)], [1]), product([variant(1, "11", "15")], [1]));
    expect(result.changes.map(({field, transition}) => [field, transition])).toEqual([["PRICE", "CHANGED"], ["COMPARE_AT_PRICE", "SET"]]);
    expect(result.coverage.status).toBe("COMPLETE");
    expect(deriveVariantPricingEvidence(product([variant(1, "10", "15")], [1]), product([variant(1, "10", null)], [1])).changes[0]?.transition).toBe("CLEARED");
  });
  it("ignores reorder, additions, removals, and formatting-equivalent decimals", () => {
    const a = variant(1, "10.00"); const b = variant(2, "20");
    expect(deriveVariantPricingEvidence(product([a, b], [1, 2]), product([b, variant(1, "10.0"), variant(3)], [1, 2, 3])).changes).toEqual([]);
  });
  it("prefers gid, supports numeric fallback, and sorts by identity then field", () => {
    const before = product([variant(9, "1", null, {admin_graphql_api_id: "gid://2"}), variant(1, "1", null)]);
    const after = product([variant(1, "2", "3"), variant(8, "2", "3", {admin_graphql_api_id: "gid://2"})]);
    expect(deriveVariantPricingEvidence(before, after).changes.map((x) => [x.variantId, x.field])).toEqual([
      ["1", "PRICE"], ["1", "COMPARE_AT_PRICE"], ["gid://2", "PRICE"], ["gid://2", "COMPARE_AT_PRICE"]]);
  });
  it("fails closed for duplicate, missing identity, malformed shape, and malformed money", () => {
    for (const state of [product([variant(1), variant(1)]), product([{price: "10", compare_at_price: null}]),
      {variants: {}}, product([{id: 1, price: true, compare_at_price: null}])])
      expect(deriveVariantPricingEvidence(state as never, product([variant(1)])).changes).toEqual([]);
  });
  it("classifies partial and unverified coverage and reports explicit bounds", () => {
    expect(deriveVariantPricingEvidence(product([variant(1)], [1, 2]), product([variant(1)], [1, 2])).coverage.status).toBe("PARTIAL");
    expect(deriveVariantPricingEvidence(product([variant(1)]), product([variant(1)])).coverage.status).toBe("UNVERIFIED");
    const limited = deriveVariantPricingEvidence(product([variant(1), variant(2)], [1, 2]), product([variant(1), variant(2)], [1, 2]),
      {maxVariantDetails: 1, maxExpectedVariantIds: 1, maxChanges: 1});
    expect(limited.coverage).toMatchObject({status: "UNVERIFIED", limited: true});
  });
  it("does not mutate input and keeps structural reorder paths without pricing signals", () => {
    const before = product([variant(1, "10"), variant(2, "20")]); const after = product([variant(2, "20"), variant(1, "10")]);
    const copy = JSON.stringify([before, after]); const analysis = analyzeCatalogComparison("PRODUCT", before as never, after as never);
    expect(analysis.structural.entries.length).toBeGreaterThan(0);
    expect(analysis.signals.some((x) => x.code.startsWith("VARIANT_PRICE"))).toBe(false);
    expect(JSON.stringify([before, after])).toBe(copy);
  });
  it("emits compatible pricing signals and finding only for actual identity changes", () => {
    const analysis = analyzeCatalogComparison("PRODUCT", product([variant(1, "10")]) as never, product([variant(1, "11")]) as never);
    expect(analysis.signals.map((x) => x.code)).toContain("VARIANT_PRICE_CHANGED");
    expect(analysis.findings.map((x) => x.code)).toContain("VARIANT_PRICING_CHANGED");
  });
});
