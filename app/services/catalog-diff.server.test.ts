import {CatalogResourceType} from "@prisma/client";
import {describe, expect, it, vi} from "vitest";
import {diffCanonicalJson, queryCatalogStructuralDiff, renderDiffValue, type CatalogDiffRepository,
  type DiffSnapshot} from "./catalog-diff.server";

const limits = {maxDepth: 32, maxVisitedNodes: 20_000, maxEntries: 200, maxRenderedValueLength: 500};

describe("deterministic structural JSON diff", () => {
  it("returns no entries for equal states without mutating inputs", () => {
    const previous = {nested: [null, true, 2, "x"]}; const current = structuredClone(previous);
    expect(diffCanonicalJson(previous, current, limits).entries).toEqual([]);
    expect(previous).toEqual({nested: [null, true, 2, "x"]}); expect(current).toEqual(previous);
  });
  it.each([
    ["string", {v: "a"}, {v: "b"}], ["number", {v: 1}, {v: 2}], ["boolean", {v: false}, {v: true}],
    ["null to value", {v: null}, {v: "x"}], ["value to null", {v: "x"}, {v: null}],
  ])("reports a %s scalar change", (_name, previous, current) => {
    expect(diffCanonicalJson(previous, current, limits).entries).toEqual([{path: "/v", operation: "CHANGED",
      before: previous.v, after: current.v}]);
  });
  it("reports added, removed, nested, and escaped object keys in lexical order", () => {
    const result = diffCanonicalJson({gone: 1, nested: {z: 1}, "t~": 1},
      {added: 2, nested: {z: 2}, "s/": 1}, limits);
    expect(result.entries.map(({path, operation}) => [path, operation])).toEqual([
      ["/added", "ADDED"], ["/gone", "REMOVED"], ["/nested/z", "CHANGED"], ["/s~1", "ADDED"], ["/t~0", "REMOVED"],
    ]);
  });
  it("compares arrays positionally in ascending index order", () => {
    expect(diffCanonicalJson([0, 1, 2], [9, 1, 3, 4], limits).entries).toEqual([
      {path: "/0", operation: "CHANGED", before: 0, after: 9},
      {path: "/2", operation: "CHANGED", before: 2, after: 3},
      {path: "/3", operation: "ADDED", after: 4},
    ]);
    expect(diffCanonicalJson([0, 1], [0], limits).entries).toEqual([{path: "/1", operation: "REMOVED", before: 1}]);
  });
  it("emits one root or nested entry for type changes and handles empty structures", () => {
    expect(diffCanonicalJson(1, 2, limits).entries[0]).toEqual({path: "", operation: "CHANGED", before: 1, after: 2});
    expect(diffCanonicalJson({v: 1}, {v: {}}, limits).entries).toHaveLength(1);
    expect(diffCanonicalJson({v: {}}, {v: []}, limits).entries).toHaveLength(1);
    expect(diffCanonicalJson({}, {}, limits).entries).toEqual([]); expect(diffCanonicalJson([], [], limits).entries).toEqual([]);
  });
  it("is byte-for-byte deterministic", () => {
    const first = diffCanonicalJson({z: [1, 2], a: 1}, {a: 2, z: [2]}, limits);
    expect(JSON.stringify(diffCanonicalJson({z: [1, 2], a: 1}, {a: 2, z: [2]}, limits))).toBe(JSON.stringify(first));
  });
});

describe("diff safety limits and display", () => {
  it.each([
    ["depth", {maxDepth: 0, maxVisitedNodes: 20, maxEntries: 20, maxRenderedValueLength: 20}],
    ["nodes", {maxDepth: 20, maxVisitedNodes: 1, maxEntries: 20, maxRenderedValueLength: 20}],
    ["entries", {maxDepth: 20, maxVisitedNodes: 20, maxEntries: 1, maxRenderedValueLength: 20}],
  ])("enforces %s deterministically and reports truncation", (_name, bounded) => {
    const one = diffCanonicalJson({a: {x: 1}, b: 1}, {a: {x: 2}, b: 2}, bounded);
    const two = diffCanonicalJson({a: {x: 1}, b: 1}, {a: {x: 2}, b: 2}, bounded);
    expect(one.truncated).toBe(true); expect(two).toEqual(one);
  });
  it("truncates strings and summarizes arrays and objects", () => {
    expect(renderDiffValue("abcdefgh", true, 5)).toEqual({kind: "scalar", text: '"abc…', truncated: true});
    expect(renderDiffValue([1, 2, 3], true, 20).text).toContain("Array (3 items)");
    expect(renderDiffValue({a: 1, b: 2}, true, 24).text).toContain("Object (2 keys)");
    expect(renderDiffValue(undefined, false).kind).toBe("missing"); expect(renderDiffValue(null, true).kind).toBe("null");
  });
});

const at = new Date("2026-07-22T12:00:00Z");
function snapshot(id: string, overrides: Partial<DiffSnapshot> = {}): DiffSnapshot {
  return {id, resourceType: CatalogResourceType.PRODUCT, resourceId: "gid://shopify/Product/1", sourceTopic: "PRODUCTS_UPDATE",
    state: '{"title":"new"}', isDeleted: false, occurredAt: at, receivedAt: at, createdAt: at, ...overrides};
}
function repository(current: DiffSnapshot | null, previous: DiffSnapshot | null): CatalogDiffRepository {
  return {findCurrent: vi.fn(async (input) => current && input.shop === "one.myshopify.com" && current.resourceType === input.resourceType &&
    current.resourceId === input.resourceId && current.id === input.snapshotId ? current : null),
  findPrevious: vi.fn(async () => previous)};
}

describe("snapshot comparison eligibility and isolation", () => {
  it("compares an update only with the repository-selected adjacent active snapshot", async () => {
    const result = await queryCatalogStructuralDiff("one.myshopify.com", "PRODUCT", "gid://shopify/Product/1", "current",
      repository(snapshot("current"), snapshot("adjacent", {state: '{"title":"old"}', occurredAt: new Date(at.valueOf() - 1)})));
    expect(result?.status).toBe("COMPARABLE"); expect(result?.previousSnapshotId).toBe("adjacent");
    expect(result?.entries[0]).toEqual({path: "/title", operation: "CHANGED", before: "old", after: "new"});
  });
  it.each([
    ["first update", snapshot("current"), null, "NO_PREVIOUS_SNAPSHOT"],
    ["creation", snapshot("current", {sourceTopic: "PRODUCTS_CREATE"}), null, "CREATED_WITHOUT_BASELINE"],
    ["deletion", snapshot("current", {sourceTopic: "PRODUCTS_DELETE", isDeleted: true}), null, "DELETED_TOMBSTONE"],
    ["after tombstone", snapshot("current"), snapshot("old", {sourceTopic: "PRODUCTS_DELETE", isDeleted: true}), "PREVIOUS_TOMBSTONE"],
    ["inconsistent", snapshot("current", {isDeleted: true}), null, "INVALID_LIFECYCLE"],
    ["unsupported", snapshot("current", {sourceTopic: "ORDERS_UPDATE"}), null, "INVALID_LIFECYCLE"],
  ])("handles %s safely", async (_name, current, previous, status) => {
    expect((await queryCatalogStructuralDiff("one.myshopify.com", "PRODUCT", current.resourceId, current.id,
      repository(current, previous)))?.status).toBe(status);
  });
  it("fails safely for malformed type/id and cross-shop or resource lookup", async () => {
    const repo = repository(snapshot("current"), null);
    expect(await queryCatalogStructuralDiff("one.myshopify.com", "INVENTORY", "x", "current", repo)).toBeUndefined();
    expect(await queryCatalogStructuralDiff("one.myshopify.com", "PRODUCT", "x", "", repo)).toBeUndefined();
    expect(await queryCatalogStructuralDiff("other.myshopify.com", "PRODUCT", "gid://shopify/Product/1", "current", repo)).toBeUndefined();
    expect(await queryCatalogStructuralDiff("one.myshopify.com", "PRODUCT", "gid://shopify/Product/2", "current", repo)).toBeUndefined();
  });
});
