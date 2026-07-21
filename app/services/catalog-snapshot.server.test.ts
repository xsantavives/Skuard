import {CatalogResourceType, WebhookState, type CatalogSnapshot, type CatalogWebhook} from "@prisma/client";
import {createHash} from "node:crypto";
import {describe, expect, it, vi} from "vitest";
import {
  createSnapshotState, isDeletionTopic, parseSnapshotDiagnosticFilters, persistCatalogSnapshot,
  querySnapshotDiagnostics, snapshotDataFromWebhook, snapshotStateHash, type CatalogSnapshotRepository,
} from "./catalog-snapshot.server";

const webhook = (topic: string, resourceType: CatalogResourceType = CatalogResourceType.PRODUCT, payload = '{"id":42,"title":"Shirt"}'): CatalogWebhook => ({
  id: `source-${topic}`, webhookId: `delivery-${topic}`, shop: "one.myshopify.com", topic, resourceType,
  payload, payloadHash: "payload-hash", resourceId: "42", occurredAt: new Date("2026-07-21T10:00:00Z"),
  state: WebhookState.RECEIVED, error: null, receivedAt: new Date("2026-07-21T10:00:01Z"), processedAt: null,
});

const snapshot = (source: CatalogWebhook): CatalogSnapshot => {
  const data = snapshotDataFromWebhook(source);
  return {
    id: "snapshot-1", shop: data.shop, resourceType: data.resourceType, resourceId: data.resourceId,
    sourceWebhookId: data.sourceWebhookId, sourceTopic: data.sourceTopic, state: data.state, stateHash: data.stateHash,
    isDeleted: data.isDeleted, occurredAt: source.occurredAt, receivedAt: source.receivedAt,
    createdAt: new Date("2026-07-21T10:00:02Z"),
  };
};

const repository = (overrides: Partial<CatalogSnapshotRepository> = {}): CatalogSnapshotRepository => ({
  create: vi.fn(async (data) => ({id: "snapshot-1", ...data, createdAt: new Date()})),
  findBySourceWebhookId: vi.fn().mockResolvedValue(null), recentForShop: vi.fn().mockResolvedValue([]), ...overrides,
});

describe("catalog snapshot projection", () => {
  it.each([
    ["PRODUCTS_CREATE", CatalogResourceType.PRODUCT, false], ["PRODUCTS_UPDATE", CatalogResourceType.PRODUCT, false],
    ["PRODUCTS_DELETE", CatalogResourceType.PRODUCT, true], ["COLLECTIONS_CREATE", CatalogResourceType.COLLECTION, false],
    ["COLLECTIONS_UPDATE", CatalogResourceType.COLLECTION, false], ["COLLECTIONS_DELETE", CatalogResourceType.COLLECTION, true],
  ])("projects %s with complete canonical state and tombstone semantics", (topic, type, deleted) => {
    const payload = {z: {b: 2, a: 1}, id: 42, variants: [{title: "Blue", id: 9}]};
    const source = webhook(topic, type, JSON.stringify(payload));
    const data = snapshotDataFromWebhook(source);
    expect(JSON.parse(data.state)).toEqual(payload);
    expect(data.state).toBe('{"id":42,"variants":[{"id":9,"title":"Blue"}],"z":{"a":1,"b":2}}');
    expect(data.stateHash).toBe(createHash("sha256").update(data.state).digest("hex"));
    expect(data).toMatchObject({resourceType: type, resourceId: "42", sourceWebhookId: source.id,
      sourceTopic: topic, isDeleted: deleted, occurredAt: source.occurredAt, receivedAt: source.receivedAt});
  });

  it("canonicalizes and hashes deterministically", () => {
    expect(createSnapshotState({b: 2, a: {d: 4, c: 3}})).toBe(createSnapshotState({a: {c: 3, d: 4}, b: 2}));
    expect(snapshotStateHash('{"a":1}')).toMatch(/^[a-f0-9]{64}$/);
  });

  it.each(["PRODUCTS_DELETE", "COLLECTIONS_DELETE"])("recognizes deletion topic %s", (topic) => {
    expect(isDeletionTopic(topic)).toBe(true);
  });

  it("rejects a missing resource ID safely", () => {
    expect(() => snapshotDataFromWebhook({...webhook("PRODUCTS_UPDATE"), resourceId: null})).toThrow("has no resource ID");
  });

  it("creates at most one snapshot per source webhook", async () => {
    const source = webhook("PRODUCTS_CREATE");
    const existing = snapshot(source);
    const repo = repository({findBySourceWebhookId: vi.fn().mockResolvedValue(existing)});
    expect(await persistCatalogSnapshot(source, repo)).toEqual({snapshot: existing, duplicate: true});
    expect(repo.create).not.toHaveBeenCalled();
  });
});

describe("snapshot diagnostics", () => {
  it("bounds and shop-scopes filtered queries", async () => {
    const repo = repository();
    const filters = parseSnapshotDiagnosticFilters(new URLSearchParams({
      snapshotResourceType: "COLLECTION", snapshotTopic: "COLLECTIONS_UPDATE", snapshotDeleted: "false",
    }));
    await querySnapshotDiagnostics("one.myshopify.com", 500, filters, repo);
    expect(repo.recentForShop).toHaveBeenCalledWith("one.myshopify.com", 100, {
      resourceType: CatalogResourceType.COLLECTION, sourceTopic: "COLLECTIONS_UPDATE", isDeleted: false,
    });
  });

  it("ignores invalid filters safely", () => {
    expect(parseSnapshotDiagnosticFilters(new URLSearchParams({
      snapshotResourceType: "INVENTORY", snapshotTopic: "ORDERS_CREATE", snapshotDeleted: "perhaps",
    }))).toEqual({});
  });
});
