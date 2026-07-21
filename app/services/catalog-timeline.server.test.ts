import {CatalogResourceType} from "@prisma/client";
import {describe, expect, it, vi} from "vitest";
import {actionForCatalogTopic, compareTimelineEntries, decodeTimelineCursor, encodeTimelineCursor,
  parseTimelineFilters, queryCatalogResourceHistory, queryCatalogTimeline, type CatalogTimelineEntry,
  type CatalogTimelineRepository} from "./catalog-timeline.server";

const instant = new Date("2026-07-24T12:00:00.000Z");
function entry(id: string, overrides: Partial<CatalogTimelineEntry> = {}): CatalogTimelineEntry {
  return {id, resourceType: CatalogResourceType.PRODUCT, resourceId: "product-1", action: "UPDATED",
    sourceTopic: "PRODUCTS_UPDATE", isDeleted: false, occurredAt: instant, receivedAt: instant,
    createdAt: instant, stateHash: `hash-${id}`, ...overrides};
}

function memoryRepository(all: CatalogTimelineEntry[]): CatalogTimelineRepository {
  return {findMetadata: vi.fn(async ({shop, take, filters, before}) => {
    if (shop !== "one.myshopify.com") return [];
    let values = all.filter((value) =>
      (!filters.resourceType || value.resourceType === filters.resourceType) &&
      (!filters.action || value.action === filters.action) &&
      (!filters.sourceTopic || value.sourceTopic === filters.sourceTopic) &&
      (filters.isDeleted === undefined || value.isDeleted === filters.isDeleted) &&
      (!filters.resourceId || value.resourceId === filters.resourceId));
    values.sort(compareTimelineEntries);
    if (before) {
      const cursorEntry = entry(before.id, {occurredAt: new Date(before.effectiveAt), receivedAt: new Date(before.receivedAt),
        createdAt: new Date(before.createdAt)});
      values = values.filter((value) => compareTimelineEntries(value, cursorEntry) > 0);
    }
    return values.slice(0, take).map(({action: _action, ...metadata}) => metadata);
  })};
}

describe("catalog timeline action mapping", () => {
  it.each([
    ["PRODUCTS_CREATE", "CREATED"], ["PRODUCTS_UPDATE", "UPDATED"], ["PRODUCTS_DELETE", "DELETED"],
    ["COLLECTIONS_CREATE", "CREATED"], ["COLLECTIONS_UPDATE", "UPDATED"], ["COLLECTIONS_DELETE", "DELETED"],
  ])("maps %s to %s", (topic, action) => expect(actionForCatalogTopic(topic)).toBe(action));
  it("rejects unsupported topics", () => expect(() => actionForCatalogTopic("ORDERS_CREATE")).toThrow("Unsupported"));
});

describe("catalog timeline ordering and cursors", () => {
  it("orders newest-first by effective, received, created, and ID with received fallback", () => {
    const values = [
      entry("a", {occurredAt: null, receivedAt: new Date("2026-07-24T13:00:00Z")}),
      entry("z"), entry("a"),
      entry("created", {createdAt: new Date("2026-07-24T12:00:01Z")}),
      entry("received", {receivedAt: new Date("2026-07-24T12:00:01Z")}),
    ].sort(compareTimelineEntries);
    expect(values.map(({id}) => id)).toEqual(["a", "received", "created", "z", "a"]);
  });

  it("round-trips an opaque full-tuple cursor and rejects malformed cursors", () => {
    const encoded = encodeTimelineCursor(entry("snapshot-1"));
    expect(encoded).not.toContain("snapshot-1");
    expect(decodeTimelineCursor(encoded)).toEqual({effectiveAt: instant.toISOString(), receivedAt: instant.toISOString(),
      createdAt: instant.toISOString(), id: "snapshot-1"});
    expect(decodeTimelineCursor("not-json")).toBeUndefined();
    expect(decodeTimelineCursor(Buffer.from('{"id":"x"}').toString("base64url"))).toBeUndefined();
  });
});

describe("catalog timeline queries", () => {
  it("uses default 25, caps at 50, and reports continuation", async () => {
    const values = Array.from({length: 52}, (_, index) => entry(String(index).padStart(2, "0")));
    const repo = memoryRepository(values);
    const first = await queryCatalogTimeline("one.myshopify.com", {}, repo);
    expect(first.entries).toHaveLength(25); expect(first.hasNextPage).toBe(true); expect(first.nextCursor).toBeTruthy();
    await queryCatalogTimeline("one.myshopify.com", {limit: 500}, repo);
    expect(repo.findMetadata).toHaveBeenLastCalledWith(expect.objectContaining({take: 51}));
  });

  it("does not duplicate or skip identical-timestamp records across pages", async () => {
    const repo = memoryRepository([entry("e"), entry("d"), entry("c"), entry("b"), entry("a")]);
    const first = await queryCatalogTimeline("one.myshopify.com", {limit: 2}, repo);
    const second = await queryCatalogTimeline("one.myshopify.com", {limit: 2, cursor: first.nextCursor}, repo);
    const third = await queryCatalogTimeline("one.myshopify.com", {limit: 2, cursor: second.nextCursor}, repo);
    expect([...first.entries, ...second.entries, ...third.entries].map(({id}) => id)).toEqual(["e", "d", "c", "b", "a"]);
    expect(third.hasNextPage).toBe(false); expect(third.nextCursor).toBeUndefined();
  });

  it("allow-lists and composes filters while preserving shop isolation", async () => {
    expect(parseTimelineFilters(new URLSearchParams("resourceType=INVENTORY&action=REMOVED&topic=ORDERS_CREATE&deleted=maybe"))).toEqual({});
    const filters = parseTimelineFilters(new URLSearchParams("resourceType=COLLECTION&action=DELETED&topic=COLLECTIONS_DELETE&deleted=true"));
    expect(filters).toEqual({resourceType: "COLLECTION", action: "DELETED", sourceTopic: "COLLECTIONS_DELETE", isDeleted: true});
    const matching = entry("match", {resourceType: CatalogResourceType.COLLECTION, resourceId: "collection-1",
      action: "DELETED", sourceTopic: "COLLECTIONS_DELETE", isDeleted: true});
    expect((await queryCatalogTimeline("one.myshopify.com", {filters}, memoryRepository([matching, entry("other")]))).entries).toEqual([matching]);
    expect((await queryCatalogTimeline("other.myshopify.com", {}, memoryRepository([matching]))).entries).toEqual([]);
  });
});

describe("catalog resource history", () => {
  it("filters exact identity, orders history, and derives active/deleted status from latest", async () => {
    const old = entry("old", {occurredAt: new Date("2026-07-23T12:00:00Z")});
    const tombstone = entry("new", {action: "DELETED", sourceTopic: "PRODUCTS_DELETE", isDeleted: true});
    const history = await queryCatalogResourceHistory("one.myshopify.com", "PRODUCT", "product-1", 25,
      memoryRepository([old, tombstone, entry("other", {resourceId: "product-2"})]));
    expect(history?.entries.map(({id}) => id)).toEqual(["new", "old"]); expect(history?.status).toBe("DELETED");
    const active = await queryCatalogResourceHistory("one.myshopify.com", "PRODUCT", "product-1", 25, memoryRepository([old]));
    expect(active?.status).toBe("ACTIVE");
  });

  it("fails safely for invalid, absent, and cross-shop resources", async () => {
    const repo = memoryRepository([entry("one")]);
    expect(await queryCatalogResourceHistory("one.myshopify.com", "INVENTORY", "product-1", 25, repo)).toBeUndefined();
    expect(await queryCatalogResourceHistory("one.myshopify.com", "PRODUCT", "missing", 25, repo)).toBeUndefined();
    expect(await queryCatalogResourceHistory("other.myshopify.com", "PRODUCT", "product-1", 25, repo)).toBeUndefined();
  });
});
