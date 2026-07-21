import {CatalogResourceType, Prisma, WebhookState, type CatalogWebhook} from "@prisma/client";
import {describe, expect, it, vi} from "vitest";
import {
  canonicalJson,
  ingestCatalogWebhook,
  payloadHash,
  parseCatalogDiagnosticFilters,
  queryCatalogDiagnostics,
  resourceTypeForTopic,
  type CatalogWebhookRepository,
} from "./catalog-monitor.server";

const event = (overrides: Partial<CatalogWebhook> = {}): CatalogWebhook => ({
  id: "event-1",
  webhookId: "webhook-1",
  shop: "example.myshopify.com",
  topic: "PRODUCTS_UPDATE",
  payload: '{"id":42}',
  payloadHash: "hash",
  resourceType: CatalogResourceType.PRODUCT,
  resourceId: null,
  occurredAt: null,
  state: WebhookState.RECEIVED,
  error: null,
  receivedAt: new Date("2026-07-21T12:00:00Z"),
  processedAt: null,
  ...overrides,
});

function repository(overrides: Partial<CatalogWebhookRepository> = {}): CatalogWebhookRepository {
  return {
    create: vi.fn().mockResolvedValue(event()),
    findByWebhookId: vi.fn().mockResolvedValue(null),
    markProcessed: vi.fn().mockResolvedValue(event({state: WebhookState.PROCESSED})),
    markFailed: vi.fn().mockResolvedValue(event({state: WebhookState.FAILED})),
    recentForShop: vi.fn().mockResolvedValue([]),
    ...overrides,
  };
}

describe("catalog monitor ingestion", () => {
  it.each(["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE"])("classifies %s as PRODUCT", (topic) => {
    expect(resourceTypeForTopic(topic)).toBe(CatalogResourceType.PRODUCT);
  });

  it.each(["COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE"])("classifies %s as COLLECTION", (topic) => {
    expect(resourceTypeForTopic(topic)).toBe(CatalogResourceType.COLLECTION);
  });

  it("hashes object payloads deterministically", () => {
    expect(payloadHash({id: 1, title: "Shirt"})).toBe(payloadHash({title: "Shirt", id: 1}));
    expect(payloadHash({id: 1})).toMatch(/^[a-f0-9]{64}$/);
  });

  it("persists the complete payload as parseable canonical JSON", async () => {
    const repo = repository();
    const payload = {
      id: 42,
      title: "Shirt",
      variants: [{id: 7, options: ["Blue", "Large"]}],
      metadata: {vendor: "Skuard", active: true},
    };

    await ingestCatalogWebhook(
      {webhookId: "webhook-1", shop: "example.myshopify.com", topic: "PRODUCTS_CREATE", payload},
      repo,
    );

    const persisted = vi.mocked(repo.create).mock.calls[0][0];
    expect(JSON.parse(persisted.payload)).toEqual(payload);
    expect(persisted.payload).toBe(canonicalJson(payload));
    expect(persisted.payloadHash).toBe(payloadHash(payload));
  });

  it("produces the same canonical payload and hash regardless of object key order", () => {
    const first = {product: {title: "Shirt", id: 42}, tags: ["summer", "sale"]};
    const second = {tags: ["summer", "sale"], product: {id: 42, title: "Shirt"}};

    expect(canonicalJson(first)).toBe(canonicalJson(second));
    expect(payloadHash(first)).toBe(payloadHash(second));
  });

  it("retains complete products/delete payloads", async () => {
    const repo = repository();
    const payload = {id: 42, admin_graphql_api_id: "gid://shopify/Product/42"};

    await ingestCatalogWebhook(
      {webhookId: "delete-1", shop: "example.myshopify.com", topic: "PRODUCTS_DELETE", payload},
      repo,
    );

    const persisted = vi.mocked(repo.create).mock.calls[0][0];
    expect(JSON.parse(persisted.payload)).toEqual(payload);
  });

  it.each(["COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE"])(
    "ingests %s with canonical payload and collection metadata",
    async (topic) => {
      const repo = repository();
      const payload = {
        updated_at: "2026-07-22T10:30:00Z",
        id: 42,
        rules: [{column: "TITLE", relation: "CONTAINS", condition: "Sale"}],
        admin_graphql_api_id: "gid://shopify/Collection/42",
      };

      await ingestCatalogWebhook({webhookId: topic, shop: "example.myshopify.com", topic, payload}, repo);

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        resourceType: CatalogResourceType.COLLECTION,
        resourceId: "gid://shopify/Collection/42",
        occurredAt: new Date("2026-07-22T10:30:00Z"),
        payload: canonicalJson(payload),
        payloadHash: payloadHash(payload),
      }));
    },
  );

  it("falls back to a collection numeric ID and created occurrence time", async () => {
    const repo = repository();
    await ingestCatalogWebhook({
      webhookId: "collection-1", shop: "example.myshopify.com", topic: "COLLECTIONS_CREATE",
      payload: {id: 7, created_at: "2026-07-22T09:00:00Z"},
    }, repo);
    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: "7", occurredAt: new Date("2026-07-22T09:00:00Z"),
    }));
  });

  it("rejects unsupported topics before persistence", async () => {
    const repo = repository();
    await expect(ingestCatalogWebhook({
      webhookId: "bad", shop: "example.myshopify.com", topic: "VARIANTS_CREATE", payload: {id: 1},
    }, repo)).rejects.toThrow("Unsupported catalog topic");
    expect(repo.create).not.toHaveBeenCalled();
  });

  it("persists authenticated data through RECEIVED and PROCESSED", async () => {
    const repo = repository();
    const result = await ingestCatalogWebhook(
      {
        webhookId: "webhook-1",
        shop: "example.myshopify.com",
        topic: "PRODUCTS_UPDATE",
        payload: {id: 42, updated_at: "2026-07-21T10:30:00Z", title: "Shirt"},
      },
      repo,
    );

    expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
      resourceId: "42",
      occurredAt: new Date("2026-07-21T10:30:00Z"),
      state: WebhookState.RECEIVED,
    }));
    expect(repo.markProcessed).toHaveBeenCalledWith("event-1");
    expect(result.duplicate).toBe(false);
  });

  it("treats a duplicate webhook ID as a successful idempotent delivery", async () => {
    const duplicate = event({payload: '{"id":42,"title":"Original"}', state: WebhookState.PROCESSED});
    const conflict = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "test",
    });
    const repo = repository({
      create: vi.fn().mockRejectedValue(conflict),
      findByWebhookId: vi.fn().mockResolvedValue(duplicate),
    });

    const result = await ingestCatalogWebhook(
      {webhookId: "webhook-1", shop: duplicate.shop, topic: duplicate.topic, payload: {id: 42, title: "Changed"}},
      repo,
    );

    expect(result).toEqual({record: duplicate, duplicate: true});
    expect(repo.markProcessed).not.toHaveBeenCalled();
    expect(repo.create).toHaveBeenCalledOnce();
    expect(result.record.payload).toBe('{"id":42,"title":"Original"}');
  });

  it("marks a received record FAILED and propagates processing persistence errors", async () => {
    const failure = new Error("database unavailable");
    const repo = repository({markProcessed: vi.fn().mockRejectedValue(failure)});

    await expect(ingestCatalogWebhook(
      {webhookId: "webhook-1", shop: "example.myshopify.com", topic: "PRODUCTS_CREATE", payload: {id: 1}},
      repo,
    )).rejects.toThrow("database unavailable");
    expect(repo.markFailed).toHaveBeenCalledWith("event-1", "database unavailable");
  });

  it("bounds the internal diagnostic query", async () => {
    const repo = repository();
    await queryCatalogDiagnostics("example.myshopify.com", 500, {}, repo);
    expect(repo.recentForShop).toHaveBeenCalledWith("example.myshopify.com", 100, {});
  });

  it("passes safe resource-type and topic diagnostic filters with shop isolation", async () => {
    const repo = repository();
    const filters = parseCatalogDiagnosticFilters(new URLSearchParams({
      resourceType: "COLLECTION", topic: "COLLECTIONS_UPDATE",
    }));
    await queryCatalogDiagnostics("one.myshopify.com", 50, filters, repo);
    expect(repo.recentForShop).toHaveBeenCalledWith("one.myshopify.com", 50, {
      resourceType: CatalogResourceType.COLLECTION, topic: "COLLECTIONS_UPDATE",
    });
  });

  it("safely ignores invalid diagnostic filters", () => {
    expect(parseCatalogDiagnosticFilters(new URLSearchParams({
      resourceType: "INVENTORY", topic: "ORDERS_CREATE",
    }))).toEqual({});
  });
});
