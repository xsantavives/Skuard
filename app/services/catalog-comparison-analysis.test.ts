import {describe, expect, it} from "vitest";
import {analyzeCatalogComparison, canonicalProductVariantIdentity, deriveVariantPricingEvidence} from "./catalog-comparison-analysis";
import type {JsonValue} from "./catalog-structural-diff";

const product = (variants: JsonValue[], variant_gids?: JsonValue[]): JsonValue => ({variants, ...(variant_gids ? {variant_gids} : {})});
const variant = (id: string | number, price = "10.00", compare_at_price: string | null = null, extra = {}) =>
  ({id, price, compare_at_price, ...extra});

describe("identity-aware variant pricing evidence", () => {
  it("accepts only canonicalizable positive safe ProductVariant identities", () => {
    const gid = "gid://shopify/ProductVariant/123";
    for (const value of [123, "123", gid, {id: 123}, {id: "123"}, {admin_graphql_api_id: gid},
      {id: 123, admin_graphql_api_id: gid}] as JsonValue[])
      expect(canonicalProductVariantIdentity(value)).toBe(gid);
    for (const value of ["gid://shopify/Product/123", "gid://shopify/ProductVariant/nope", 0, -1, 1.5,
      "+1", "-1", "1.0", "9007199254740992", "", " ", " 1", "1 ",
      {id: 1, admin_graphql_api_id: "gid://shopify/ProductVariant/2"}] as JsonValue[])
      expect(canonicalProductVariantIdentity(value)).toBeUndefined();
  });

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
  it("canonicalizes numeric and GID identities and sorts by identity then field", () => {
    const gid = "gid://shopify/ProductVariant/2";
    const before = product([variant(2, "1", null, {admin_graphql_api_id: gid}), variant(1, "1", null)], [gid, 1]);
    const after = product([variant(1, "2", "3"), variant("2", "2", "3", {admin_graphql_api_id: gid})], [1, gid]);
    expect(deriveVariantPricingEvidence(before, after).changes.map((x) => [x.variantId, x.field])).toEqual([
      ["gid://shopify/ProductVariant/1", "PRICE"], ["gid://shopify/ProductVariant/1", "COMPARE_AT_PRICE"],
      [gid, "PRICE"], [gid, "COMPARE_AT_PRICE"]]);
  });
  it("fails closed for duplicate, missing identity, malformed shape, and malformed money", () => {
    for (const state of [product([variant(1), variant(1)]), product([{price: "10", compare_at_price: null}]),
      {variants: {}}, product([{id: 1, price: true, compare_at_price: null}])])
      expect(deriveVariantPricingEvidence(state as never, product([variant(1)])).changes).toEqual([]);
  });
  it("classifies partial and unverified coverage and reports explicit bounds", () => {
    const complete = deriveVariantPricingEvidence(product([variant(1), variant(2)], [2, 1]), product([variant(2), variant(1)], [1, 2]));
    expect(complete.coverage.status).toBe("COMPLETE");
    const partial = deriveVariantPricingEvidence(product([variant(1)], [1, 2]), product([variant(1)], [1, 2]));
    expect(partial.coverage.status).toBe("PARTIAL");
    expect(partial.coverage.previous).toMatchObject({expectedIdentityCount: 2, detailedIdentityCount: 1,
      expectedMissingDetailCount: 1, unexpectedDetailedIdentityCount: 0});
    expect(deriveVariantPricingEvidence(product([variant(1), variant(2)], [1]), product([variant(1), variant(2)], [1])).coverage.status).toBe("UNVERIFIED");
    expect(deriveVariantPricingEvidence(product([variant(1)], [2]), product([variant(1)], [2])).coverage.status).toBe("UNVERIFIED");
    expect(deriveVariantPricingEvidence(product([variant(1)]), product([variant(1)])).coverage.status).toBe("UNVERIFIED");
    const limited = deriveVariantPricingEvidence(product([variant(1), variant(2)], [1, 2]), product([variant(1), variant(2)], [1, 2]),
      {maxVariantDetails: 1, maxExpectedVariantIds: 1, maxChanges: 1});
    expect(limited.coverage).toMatchObject({status: "UNVERIFIED", limited: true});
  });
  it("fails coverage closed for duplicate expected and detailed identities", () => {
    expect(deriveVariantPricingEvidence(product([variant(1)], [1, "1"]), product([variant(1)], [1])).coverage.status).toBe("UNVERIFIED");
    expect(deriveVariantPricingEvidence(product([variant(1), variant("1")], [1]), product([variant(1)], [1])).coverage.status).toBe("UNVERIFIED");
  });
  it("uses strict decimal strings and preserves recorded forms", () => {
    expect(deriveVariantPricingEvidence(product([variant(1, "10.00")], [1]), product([variant(1, "10.0")], [1])).changes).toEqual([]);
    expect(deriveVariantPricingEvidence(product([variant(1, "-0")], [1]), product([variant(1, "0.000")], [1])).changes).toEqual([]);
    const changed = deriveVariantPricingEvidence(product([variant(1, "10.00")], [1]), product([variant(1, "10.01")], [1])).changes[0];
    expect(changed).toMatchObject({before: "10.00", after: "10.01"});
    for (const invalid of ["10.", ".50", "01.00", "1e2", " 10.00 ", true, 42, {}, []]) {
      const state = product([{id: 1, price: invalid, compare_at_price: null} as JsonValue], [1]);
      expect(deriveVariantPricingEvidence(state, product([variant(1)], [1])).coverage.status).toBe("UNVERIFIED");
    }
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
    const pricing = analysis.signals.find((x) => x.code === "VARIANT_PRICE_CHANGED")!;
    expect(pricing).toMatchObject({evidenceKind: "VARIANT_PRICING", variantId: "gid://shopify/ProductVariant/1"});
    expect(pricing).not.toHaveProperty("path");
  });
});
