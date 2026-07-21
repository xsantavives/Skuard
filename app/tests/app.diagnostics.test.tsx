import {CatalogResourceType, WebhookState} from "@prisma/client";
import {renderToStaticMarkup} from "react-dom/server";
import {describe, expect, it, vi} from "vitest";

const event = {
  id: "event-1",
  webhookId: "webhook-1",
  shop: "one.myshopify.com",
  topic: "COLLECTIONS_UPDATE",
  resourceType: CatalogResourceType.COLLECTION,
  resourceId: "gid://shopify/Collection/42",
  occurredAt: null,
  receivedAt: new Date("2026-07-22T12:00:00Z"),
  processedAt: new Date("2026-07-22T12:00:01Z"),
  state: WebhookState.PROCESSED,
  error: null,
  payloadHash: "abc123",
  payload: '{"secret":"raw payload must remain internal"}',
};

vi.mock("../shopify.server", () => ({authenticate: {admin: vi.fn()}}));

import {DiagnosticsView} from "../routes/app.diagnostics";

describe("catalog diagnostics", () => {
  it("renders operational metadata without rendering raw payload", () => {
    const html = renderToStaticMarkup(<DiagnosticsView events={[event]} />);
    expect(html).toContain("COLLECTION");
    expect(html).toContain("COLLECTIONS_UPDATE");
    expect(html).toContain("one.myshopify.com");
    expect(html).toContain("gid://shopify/Collection/42");
    expect(html).toContain("abc123");
    expect(html).not.toContain("raw payload must remain internal");
    expect(html).not.toContain(event.payload);
  });

  it("renders bounded snapshot metadata without rendering canonical state or webhook payload", () => {
    const snapshot = {
      id: "snapshot-1", shop: event.shop, resourceType: CatalogResourceType.COLLECTION,
      resourceId: event.resourceId!, sourceWebhookId: event.id, sourceTopic: event.topic,
      state: '{"private":"snapshot state must remain internal"}', stateHash: "snapshot-hash",
      isDeleted: true, occurredAt: null, receivedAt: event.receivedAt,
      createdAt: new Date("2026-07-22T12:00:02Z"),
    };
    const html = renderToStaticMarkup(<DiagnosticsView events={[event]} snapshots={[snapshot]} />);
    expect(html).toContain("Immutable catalog snapshots");
    expect(html).toContain("snapshot-hash");
    expect(html).toContain("yes");
    expect(html).not.toContain("snapshot state must remain internal");
    expect(html).not.toContain("raw payload must remain internal");
  });
});
