import {CatalogResourceType, Prisma, WebhookState, type CatalogWebhook} from "@prisma/client";
import {describe, expect, it, vi} from "vitest";
import {
  canonicalJson,
  catalogDiagnosticFilters,
  catalogResourceTypeForTopic,
  ingestCatalogWebhook,
  payloadHash,
  queryCatalogDiagnostics,
  type CatalogWebhookRepository,
} from "./catalog-monitor.server";

const event = (overrides: Partial<CatalogWebhook> = {}): CatalogWebhook => ({
  id: "event-1",
  webhookId: "webhook-1",
  shop: "example.myshopify.com",
  topic: "PRODUCTS_UPDATE",
  resourceType: CatalogResourceType.PRODUCT,
  payload: '{"id":42}',
  payloadHash: "hash",
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

  it.each(["PRODUCTS_CREATE", "PRODUCTS_UPDATE", "PRODUCTS_DELETE"])(
    "maps %s to PRODUCT",
    (topic) => expect(catalogResourceTypeForTopic(topic)).toBe(CatalogResourceType.PRODUCT),
  );

  it.each(["COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE"])(
    "maps %s to COLLECTION",
    (topic) => expect(catalogResourceTypeForTopic(topic)).toBe(CatalogResourceType.COLLECTION),
  );

  it.each(["COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE"])(
    "ingests %s with collection metadata and canonical payload retention",
    async (topic) => {
      const repo = repository();
      const payload = {
        id: 91,
        admin_graphql_api_id: "gid://shopify/Collection/91",
        updated_at: "2026-07-22T09:30:00Z",
        rules: [{column: "TAG", relation: "EQUALS", condition: "summer"}],
      };

      await ingestCatalogWebhook({webhookId: `${topic}-1`, shop: "example.myshopify.com", topic, payload}, repo);

      expect(repo.create).toHaveBeenCalledWith(expect.objectContaining({
        topic,
        resourceType: CatalogResourceType.COLLECTION,
        resourceId: "gid://shopify/Collection/91",
        occurredAt: new Date("2026-07-22T09:30:00Z"),
        payload: canonicalJson(payload),
        payloadHash: payloadHash(payload),
      }));
    },
  );

  it("keeps duplicate collection delivery successful without overwriting payload", async () => {
    const duplicate = event({
      webhookId: "collection-1",
      topic: "COLLECTIONS_UPDATE",
      resourceType: CatalogResourceType.COLLECTION,
      payload: '{"id":91,"title":"Original"}',
      state: WebhookState.PROCESSED,
    });
    const conflict = new Prisma.PrismaClientKnownRequestError("duplicate", {code: "P2002", clientVersion: "test"});
    const repo = repository({
      create: vi.fn().mockRejectedValue(conflict),
      findByWebhookId: vi.fn().mockResolvedValue(duplicate),
    });

    const result = await ingestCatalogWebhook({
      webhookId: "collection-1",
      shop: duplicate.shop,
      topic: duplicate.topic,
      payload: {id: 91, title: "Changed"},
    }, repo);

    expect(result).toEqual({record: duplicate, duplicate: true});
    expect(result.record.payload).toBe('{"id":91,"title":"Original"}');
    expect(repo.markProcessed).not.toHaveBeenCalled();
  });

  it("filters diagnostics by resource type while preserving shop isolation and bounds", async () => {
    const repo = repository();
    await queryCatalogDiagnostics("example.myshopify.com", {resourceType: "COLLECTION"}, 500, repo);
    expect(repo.recentForShop).toHaveBeenCalledWith(
      "example.myshopify.com",
      100,
      {resourceType: CatalogResourceType.COLLECTION, topic: undefined},
    );
  });

  it("filters diagnostics by supported topic", async () => {
    const repo = repository();
    await queryCatalogDiagnostics("other.myshopify.com", {topic: "COLLECTIONS_DELETE"}, 50, repo);
    expect(repo.recentForShop).toHaveBeenCalledWith(
      "other.myshopify.com",
      50,
      {resourceType: undefined, topic: "COLLECTIONS_DELETE"},
    );
  });

  it("ignores invalid diagnostic filters safely", () => {
    expect(catalogDiagnosticFilters({resourceType: "ORDER", topic: "INVENTORY_LEVELS_UPDATE"})).toEqual({
      resourceType: undefined,
      topic: undefined,
    });
  });
});
