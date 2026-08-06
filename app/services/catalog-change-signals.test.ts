import {describe, expect, it} from "vitest";
import {
  deriveCatalogChangeSignals,
  summarizeCatalogChangeSignals,
  type CatalogChangeSignalEntry,
} from "./catalog-change-signals";

const entry = (path: string, operation: CatalogChangeSignalEntry["operation"] = "CHANGED",
  before: CatalogChangeSignalEntry["before"] = "before", after: CatalogChangeSignalEntry["after"] = "after") =>
  ({path, operation, before, after});

describe("deriveCatalogChangeSignals", () => {
  it.each([
    ["/title", "PRODUCT_TITLE_CHANGED"], ["/handle", "PRODUCT_HANDLE_CHANGED"],
    ["/status", "PRODUCT_STATUS_CHANGED"], ["/published_at", "PRODUCT_PUBLICATION_CHANGED"],
    ["/published_scope", "PRODUCT_PUBLICATION_CHANGED"], ["/vendor", "PRODUCT_VENDOR_CHANGED"],
    ["/product_type", "PRODUCT_TYPE_CHANGED"], ["/tags", "PRODUCT_TAGS_CHANGED"],
    ["/tags/0", "PRODUCT_TAGS_CHANGED"], ["/options/0/name", "PRODUCT_OPTIONS_CHANGED"],
    ["/variants/0/sku", "VARIANT_SKU_CHANGED"], ["/variants/0/barcode", "VARIANT_BARCODE_CHANGED"],
    ["/images/0/src", "PRODUCT_MEDIA_CHANGED"], ["/image/src", "PRODUCT_MEDIA_CHANGED"],
  ])("maps product path %s to %s", (path, code) => {
    expect(deriveCatalogChangeSignals("PRODUCT", [entry(path)])[0]).toMatchObject({evidenceKind: "STRUCTURAL_PATH", code, path, operation: "CHANGED"});
  });

  it.each([
    ["/title", "COLLECTION_TITLE_CHANGED"], ["/handle", "COLLECTION_HANDLE_CHANGED"],
    ["/published_at", "COLLECTION_PUBLICATION_CHANGED"], ["/published_scope", "COLLECTION_PUBLICATION_CHANGED"],
    ["/sort_order", "COLLECTION_SORT_ORDER_CHANGED"], ["/disjunctive", "COLLECTION_RULES_CHANGED"],
    ["/rules/0/condition", "COLLECTION_RULES_CHANGED"], ["/image/src", "COLLECTION_MEDIA_CHANGED"],
  ])("maps collection path %s to %s", (path, code) => {
    expect(deriveCatalogChangeSignals("COLLECTION", [entry(path)])[0]).toMatchObject({code, path});
  });

  it("keeps rules resource-specific", () => {
    expect(deriveCatalogChangeSignals("COLLECTION", [entry("/status"), entry("/variants/0/price")])).toEqual([]);
    expect(deriveCatalogChangeSignals("PRODUCT", [entry("/rules/0/condition"), entry("/sort_order")])).toEqual([]);
    expect(deriveCatalogChangeSignals("PRODUCT", [entry("/title")])[0]?.code).toBe("PRODUCT_TITLE_CHANGED");
    expect(deriveCatalogChangeSignals("COLLECTION", [entry("/title")])[0]?.code).toBe("COLLECTION_TITLE_CHANGED");
  });

  it.each(["/metadata/price", "/price", "/variants/0/price_extra", "/variants/x/price",
    "/variants/12abc/price", "/nested/status", "/nested/title", "/updated_at", "/created_at",
    "/unknown", "", "not/a/pointer", "/variants/~2/price", "/variants/0/price~"])("does not match %s", (path) => {
    expect(deriveCatalogChangeSignals("PRODUCT", [entry(path)])).toEqual([]);
  });

  it("preserves valid pointer evidence and does not confuse escaped segments", () => {
    expect(deriveCatalogChangeSignals("PRODUCT", [entry("/tags/0/a~1b~0c")])[0]).toMatchObject({
      path: "/tags/0/a~1b~0c", normalizedPath: "/tags/*/a~1b~0c",
    });
    expect(deriveCatalogChangeSignals("PRODUCT", [entry("/~1title"), entry("/~0title")])).toEqual([]);
  });

  it.each(["ADDED", "REMOVED", "CHANGED"] as const)("keeps product operation %s separate", (operation) => {
    expect(deriveCatalogChangeSignals("PRODUCT", [entry("/variants/0/sku", operation)])[0])
      .toMatchObject({code: "VARIANT_SKU_CHANGED", operation});
  });

  it.each(["ADDED", "REMOVED", "CHANGED"] as const)("keeps collection operation %s separate", (operation) => {
    expect(deriveCatalogChangeSignals("COLLECTION", [entry("/rules/0/condition", operation)])[0])
      .toMatchObject({code: "COLLECTION_RULES_CHANGED", operation});
  });

  it("matches independently of values and preserves all provided evidence", () => {
    const entries: CatalogChangeSignalEntry[] = [
      entry("/title", "CHANGED", "a", "b"), entry("/title", "CHANGED", 1, 2),
      entry("/title", "CHANGED", null, null), entry("/title", "CHANGED", [1], []),
      entry("/title", "CHANGED", {a: true}, {b: false}), {path: "/title", operation: "ADDED", after: "new"},
      {path: "/title", operation: "REMOVED", before: "old"},
    ];
    const signals = deriveCatalogChangeSignals("PRODUCT", entries);
    expect(signals).toHaveLength(entries.length);
    expect(new Set(signals.map(({code}) => code))).toEqual(new Set(["PRODUCT_TITLE_CHANGED"]));
    expect(signals[5]).not.toHaveProperty("before"); expect(signals[6]).not.toHaveProperty("after");
  });

  it("returns zero or one signal per entry in input order without mutation", () => {
    const entries = [entry("/image/src"), entry("/unknown"), entry("/title"), entry("/variants/0/id")];
    const original = structuredClone(entries);
    expect(deriveCatalogChangeSignals("PRODUCT", entries).map(({code}) => code))
      .toEqual(["PRODUCT_MEDIA_CHANGED", "PRODUCT_TITLE_CHANGED"]);
    expect(entries).toEqual(original);
  });
});

describe("summarizeCatalogChangeSignals", () => {
  it("uses fixed order, counts distinct evidence, omits zeroes, and is deterministic", () => {
    const signals = deriveCatalogChangeSignals("PRODUCT", [entry("/title"), entry("/handle")]);
    const original = structuredClone(signals);
    const summary = summarizeCatalogChangeSignals(signals);
    expect(summary).toEqual([
      {code: "PRODUCT_TITLE_CHANGED", label: "Product title changed", count: 1},
      {code: "PRODUCT_HANDLE_CHANGED", label: "Product handle changed", count: 1},
    ]);
    expect(summary.reduce((total, item) => total + item.count, 0)).toBe(signals.length);
    expect(signals).toEqual(original);
    expect(JSON.stringify(summarizeCatalogChangeSignals(signals))).toBe(JSON.stringify(summary));
    expect(JSON.stringify(deriveCatalogChangeSignals("PRODUCT", [entry("/title")])))
      .toBe(JSON.stringify(deriveCatalogChangeSignals("PRODUCT", [entry("/title")])));
  });
});
