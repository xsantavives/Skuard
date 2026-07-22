import {describe, expect, it} from "vitest";
import {deriveCatalogComparisonFindings} from "./catalog-comparison-findings";
import type {CatalogChangeSignal, CatalogChangeSignalCode} from "./catalog-change-signals";

const signal = (code: CatalogChangeSignalCode, path = "/x"): CatalogChangeSignal => ({code, label: code, category:"OTHER", path, normalizedPath:path, operation:"CHANGED", before:"a", after:"b"});
const codes = (type: "PRODUCT"|"COLLECTION", values: CatalogChangeSignal[]) => deriveCatalogComparisonFindings(type, values).map((finding) => finding.code);

describe("deterministic comparison findings", () => {
  it.each([
    ["PRODUCT_TITLE_CHANGED","PRODUCT_IDENTITY_CHANGED"],["PRODUCT_HANDLE_CHANGED","PRODUCT_IDENTITY_CHANGED"],
    ["PRODUCT_STATUS_CHANGED","PRODUCT_PUBLICATION_CHANGED"],["PRODUCT_PUBLICATION_CHANGED","PRODUCT_PUBLICATION_CHANGED"],
    ["PRODUCT_VENDOR_CHANGED","PRODUCT_ORGANIZATION_CHANGED"],["PRODUCT_TYPE_CHANGED","PRODUCT_ORGANIZATION_CHANGED"],["PRODUCT_TAGS_CHANGED","PRODUCT_ORGANIZATION_CHANGED"],
    ["PRODUCT_OPTIONS_CHANGED","PRODUCT_OPTIONS_CHANGED"],["VARIANT_PRICE_CHANGED","VARIANT_PRICING_CHANGED"],["VARIANT_COMPARE_AT_PRICE_CHANGED","VARIANT_PRICING_CHANGED"],
    ["VARIANT_SKU_CHANGED","VARIANT_IDENTIFIERS_CHANGED"],["VARIANT_BARCODE_CHANGED","VARIANT_IDENTIFIERS_CHANGED"],["PRODUCT_MEDIA_CHANGED","PRODUCT_MEDIA_CHANGED"],
  ] as const)("maps %s", (input, expected) => expect(codes("PRODUCT", [signal(input)])).toContain(expected));

  it("requires product combination families", () => {
    expect(codes("PRODUCT", [signal("PRODUCT_TITLE_CHANGED"),signal("PRODUCT_STATUS_CHANGED")])).toContain("PRODUCT_IDENTITY_AND_PUBLICATION_CHANGED");
    expect(codes("PRODUCT", [signal("PRODUCT_OPTIONS_CHANGED"),signal("VARIANT_SKU_CHANGED")])).toContain("PRODUCT_OPTIONS_AND_VARIANTS_CHANGED");
    expect(codes("PRODUCT", [signal("PRODUCT_TITLE_CHANGED")])).not.toContain("PRODUCT_IDENTITY_AND_PUBLICATION_CHANGED");
    expect(codes("PRODUCT", [signal("VARIANT_PRICE_CHANGED")])).not.toContain("PRODUCT_OPTIONS_AND_VARIANTS_CHANGED");
  });

  it("derives collection atomic and combination findings", () => {
    const result = codes("COLLECTION", [signal("COLLECTION_TITLE_CHANGED"),signal("COLLECTION_PUBLICATION_CHANGED"),signal("COLLECTION_RULES_CHANGED"),signal("COLLECTION_MEDIA_CHANGED")]);
    expect(result).toEqual(["COLLECTION_IDENTITY_CHANGED","COLLECTION_PUBLICATION_CHANGED","COLLECTION_RULES_CHANGED","COLLECTION_MEDIA_CHANGED","COLLECTION_RULES_AND_PUBLICATION_CHANGED"]);
  });

  it("isolates resources and fails closed", () => {
    expect(codes("COLLECTION", [signal("PRODUCT_TITLE_CHANGED")])).toEqual([]);
    expect(codes("PRODUCT", [signal("COLLECTION_TITLE_CHANGED")])).toEqual([]);
    expect(deriveCatalogComparisonFindings("PRODUCT", [{code:"UNKNOWN"} as unknown as CatalogChangeSignal])).toEqual([]);
  });

  it("uses fixed evidence ordering, counts occurrences, and is input-order deterministic", () => {
    const input = [signal("VARIANT_COMPARE_AT_PRICE_CHANGED","/variants/0/compare_at_price"),signal("VARIANT_PRICE_CHANGED","/variants/0/price"),signal("VARIANT_PRICE_CHANGED","/variants/0/price")];
    const first = deriveCatalogComparisonFindings("PRODUCT", input);
    const pricing = first.find((finding) => finding.code === "VARIANT_PRICING_CHANGED");
    expect(pricing).toEqual({code:"VARIANT_PRICING_CHANGED",label:"Variant pricing fields changed",evidenceSignalCodes:["VARIANT_PRICE_CHANGED","VARIANT_COMPARE_AT_PRICE_CHANGED"],evidenceCount:3});
    expect(deriveCatalogComparisonFindings("PRODUCT", [...input].reverse())).toEqual(first);
    expect(deriveCatalogComparisonFindings("PRODUCT", input, {truncated:true})).toEqual(deriveCatalogComparisonFindings("PRODUCT", input, {truncated:false}));
    expect(Object.keys(pricing!)).toEqual(["code","label","evidenceSignalCodes","evidenceCount"]);
  });

  it("returns no fallback and ignores operations and values", () => {
    expect(deriveCatalogComparisonFindings("PRODUCT", [])).toEqual([]);
    const varied = {...signal("PRODUCT_TITLE_CHANGED"), operation:"ADDED" as const, before:undefined, after:{nested:[null, 2]}};
    expect(codes("PRODUCT", [varied])).toEqual(["PRODUCT_IDENTITY_CHANGED"]);
  });
});
