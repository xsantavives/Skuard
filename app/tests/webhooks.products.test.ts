import {describe, expect, it, vi} from "vitest";
vi.mock("../shopify.server", () => ({authenticate: {webhook: vi.fn()}}));

import {createCatalogWebhookAction} from "../services/catalog-webhook-handler.server";

const authenticated = {
  payload: {id: 42},
  shop: "example.myshopify.com",
  topic: "PRODUCTS_CREATE" as const,
  webhookId: "webhook-1",
};

const actionArgs = () => ({
  request: new Request("https://example.com/webhooks/products/create"),
  params: {},
  context: {},
  url: new URL("https://example.com/webhooks/products/create"),
  pattern: "/webhooks/products/create",
});

describe("product webhook route", () => {
  it("authenticates before calling the shared ingestion service", async () => {
    const order: string[] = [];
    const authenticateWebhook = vi.fn(async () => {
      order.push("authenticate");
      return authenticated;
    });
    const ingest = vi.fn(async () => {
      order.push("persist");
      return {record: {}, duplicate: false};
    });
    const action = createCatalogWebhookAction(authenticateWebhook, ingest);

    const response = await action(actionArgs());

    expect(response.status).toBe(200);
    expect(order).toEqual(["authenticate", "persist"]);
    expect(ingest).toHaveBeenCalledWith(authenticated);
  });

  it("returns 500 when persistence fails so Shopify retries", async () => {
    const action = createCatalogWebhookAction(
      vi.fn().mockResolvedValue(authenticated),
      vi.fn().mockRejectedValue(new Error("database unavailable")),
    );

    const response = await action(actionArgs());
    expect(response.status).toBe(500);
  });

  it("does not persist unsupported authenticated topics", async () => {
    const ingest = vi.fn();
    const action = createCatalogWebhookAction(
      vi.fn().mockResolvedValue({...authenticated, topic: "APP_UNINSTALLED"}),
      ingest,
    );

    const response = await action(actionArgs());
    expect(response.status).toBe(400);
    expect(ingest).not.toHaveBeenCalled();
  });
});

describe("collection webhook route", () => {
  it.each(["COLLECTIONS_CREATE", "COLLECTIONS_UPDATE", "COLLECTIONS_DELETE"])(
    "authenticates and ingests %s successfully, including duplicate deliveries",
    async (topic) => {
      const delivery = {...authenticated, webhookId: `collection-${topic}`, topic};
      const ingest = vi.fn().mockResolvedValue({record: {}, duplicate: true});
      const action = createCatalogWebhookAction(vi.fn().mockResolvedValue(delivery), ingest);
      expect((await action(actionArgs())).status).toBe(200);
      expect(ingest).toHaveBeenCalledWith(delivery);
    },
  );
});
