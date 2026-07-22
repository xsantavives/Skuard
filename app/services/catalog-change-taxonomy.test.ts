import {describe, expect, it} from "vitest";
import {
  classifyCatalogDiffEntry, normalizeCatalogChangePath, summarizeCatalogChangeClassifications,
} from "./catalog-change-taxonomy";

const entry = (path: string, operation = "CHANGED", before: unknown = "before", after: unknown = "after") =>
  ({path, operation, before, after});

describe("catalog change path normalization", () => {
  it.each([
    ["", ""], ["/title", "/title"], ["/details/title", "/details/title"],
    ["/variants/0/price", "/variants/*/price"], ["/variants/17/options/1", "/variants/*/options/*"],
    ["/items/999999999999/value", "/items/*/value"], ["/items/name/value", "/items/name/value"],
    ["/items/12abc/value", "/items/12abc/value"], ["/a~0b", "/a~0b"], ["/a~1b", "/a~1b"],
    ["/bad~2path/title", "/bad~2path/title"], ["not-a-pointer", "not-a-pointer"],
  ])("normalizes %j as %j", (path, normalized) => {
    expect(normalizeCatalogChangePath(path)).toBe(normalized);
    expect(normalizeCatalogChangePath(path)).toBe(normalizeCatalogChangePath(path));
  });

  it("uses decoded segments while retaining canonical RFC 6901 encoding", () => {
    expect(classifyCatalogDiffEntry("PRODUCT", entry("/variants~1archived/0"))).toMatchObject({category: "OTHER"});
    expect(classifyCatalogDiffEntry("PRODUCT", entry("/variants/0/a~1b~0c"))).toMatchObject({
      category: "VARIANT_DATA", normalizedPath: "/variants/*/a~1b~0c",
    });
    expect(classifyCatalogDiffEntry("PRODUCT", entry("/variants/~2/price"))).toMatchObject({category: "OTHER"});
  });
});

describe("product catalog change taxonomy", () => {
  it.each([
    ["/title", "PRODUCT_CONTENT"], ["/body_html", "PRODUCT_CONTENT"], ["/handle", "PRODUCT_IDENTITY"],
    ["/vendor", "PRODUCT_ORGANIZATION"], ["/tags", "PRODUCT_ORGANIZATION"],
    ["/status", "PRODUCT_PUBLICATION"], ["/options/0/name", "PRODUCT_OPTIONS"],
    ["/variants/17/price", "VARIANT_DATA"], ["/images/0/src", "PRODUCT_MEDIA"],
    ["/updated_at", "SYSTEM_METADATA"], ["/future", "OTHER"], ["/details/title", "OTHER"], ["", "OTHER"],
  ])("classifies %s as %s", (path, category) => {
    expect(classifyCatalogDiffEntry("PRODUCT", entry(path)).category).toBe(category);
  });
});

describe("collection catalog change taxonomy", () => {
  it.each([
    ["/title", "COLLECTION_CONTENT"], ["/handle", "COLLECTION_IDENTITY"],
    ["/sort_order", "COLLECTION_ORGANIZATION"], ["/published_at", "COLLECTION_PUBLICATION"],
    ["/rules/2/condition", "COLLECTION_RULES"], ["/disjunctive", "COLLECTION_RULES"],
    ["/image/src", "COLLECTION_MEDIA"], ["/updated_at", "SYSTEM_METADATA"], ["/future", "OTHER"], ["", "OTHER"],
  ])("classifies %s as %s", (path, category) => {
    expect(classifyCatalogDiffEntry("COLLECTION", entry(path)).category).toBe(category);
  });
});

describe("catalog taxonomy semantics", () => {
  it("is resource-type-specific", () => {
    expect(classifyCatalogDiffEntry("PRODUCT", entry("/title")).category).toBe("PRODUCT_CONTENT");
    expect(classifyCatalogDiffEntry("COLLECTION", entry("/title")).category).toBe("COLLECTION_CONTENT");
    expect(classifyCatalogDiffEntry("COLLECTION", entry("/rules/0/condition")).category).toBe("COLLECTION_RULES");
    expect(classifyCatalogDiffEntry("PRODUCT", entry("/rules/0/condition")).category).toBe("OTHER");
    expect(classifyCatalogDiffEntry("PRODUCT", entry("/variants/0/price")).category).toBe("VARIANT_DATA");
    expect(classifyCatalogDiffEntry("COLLECTION", entry("/variants/0/price")).category).toBe("OTHER");
  });

  it("does not depend on operation or values and does not mutate entries", () => {
    const entries = [entry("/title", "ADDED", undefined, "new"), entry("/title", "REMOVED", "old", undefined),
      entry("/title", "CHANGED", {old: true}, {new: true})];
    const before = structuredClone(entries);
    expect(entries.map((value) => classifyCatalogDiffEntry("PRODUCT", value).category))
      .toEqual(["PRODUCT_CONTENT", "PRODUCT_CONTENT", "PRODUCT_CONTENT"]);
    expect(entries).toEqual(before);
  });

  it("summarizes returned entries in fixed order, omits zeroes, and includes Other", () => {
    const entries = [entry("/future"), entry("/updated_at"), entry("/variants/0/price"), entry("/title"), entry("/title")];
    const before = structuredClone(entries);
    const expected = [
      {category: "PRODUCT_CONTENT", label: "Product content", count: 2},
      {category: "VARIANT_DATA", label: "Variant data", count: 1},
      {category: "SYSTEM_METADATA", label: "System metadata", count: 1},
      {category: "OTHER", label: "Other", count: 1},
    ];
    const summary = summarizeCatalogChangeClassifications("PRODUCT", entries);
    expect(summary).toEqual(expected);
    expect(summary.reduce((count, item) => count + item.count, 0)).toBe(entries.length);
    expect(JSON.stringify(summarizeCatalogChangeClassifications("PRODUCT", entries))).toBe(JSON.stringify(expected));
    expect(entries).toEqual(before);
  });
});
