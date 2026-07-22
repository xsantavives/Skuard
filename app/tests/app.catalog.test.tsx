import {CatalogResourceType} from "@prisma/client";
import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createRoutesStub} from "react-router";
import {describe, expect, it, vi} from "vitest";
vi.mock("../shopify.server", () => ({authenticate: {admin: vi.fn()}}));
import {CatalogTimelineView} from "../routes/app.catalog";
import {CatalogDiffView, CatalogResourceHistoryView} from "../routes/app.catalog.$resourceType.$resourceId";

const entry = {id: "snapshot-1", resourceType: CatalogResourceType.PRODUCT, resourceId: "gid://shopify/Product/1?private=x",
  action: "DELETED" as const, sourceTopic: "PRODUCTS_DELETE" as const, isDeleted: true,
  occurredAt: null, receivedAt: new Date("2026-07-24T12:00:00Z"), createdAt: new Date("2026-07-24T12:00:01Z"),
  stateHash: "secondary-hash"};

function renderRoute(element: ReactNode) {
  const Stub = createRoutesStub([{path: "/", Component: () => element}]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

describe("merchant catalog routes", () => {
  it("renders safe timeline metadata, encoded links, filters, and cursor navigation", () => {
    const html = renderRoute(<CatalogTimelineView entries={[entry]} hasNextPage nextCursor="opaque cursor" />);
    expect(html).toContain("Catalog activity"); expect(html).toContain("Deleted product");
    expect(html).toContain("gid%3A%2F%2Fshopify%2FProduct%2F1%3Fprivate%3Dx"); expect(html).toContain("Load more");
    expect(html).not.toContain("secondary-hash"); expect(html).not.toContain("payload"); expect(html).not.toContain("processing error");
  });

  it("renders the post-deployment empty state", () => {
    const html = renderRoute(<CatalogTimelineView entries={[]} hasNextPage={false} />);
    expect(html).toContain("No catalog activity yet"); expect(html).toContain("not backfilled");
  });

  it("renders resource identity, derived status, tombstone history, and back navigation", () => {
    const html = renderRoute(<CatalogResourceHistoryView history={{resourceType: CatalogResourceType.PRODUCT,
      resourceId: entry.resourceId, status: "DELETED", entries: [entry]}} />);
    expect(html).toContain("Product history"); expect(html).toContain("Current status:"); expect(html).toContain("Deleted");
    expect(html).toContain("Deletion tombstone"); expect(html).toContain("Back to catalog activity"); expect(html).not.toContain("secondary-hash");
    expect(html).toContain("View changes");
  });

  it("renders changed paths, labels, bounded values, null, and missing without private state", () => {
    const html = renderRoute(<CatalogDiffView diff={{currentSnapshotId: "current", previousSnapshotId: "previous",
      resourceType: CatalogResourceType.PRODUCT, resourceId: entry.resourceId, status: "COMPARABLE", currentAction: "UPDATED",
      entries: [{path: "/title", operation: "CHANGED", before: "Old", after: "New"},
        {path: "/variants/0/price", operation: "CHANGED", before: "10", after: "12"},
        {path: "/updated_at", operation: "CHANGED", before: "old date", after: "new date"},
        {path: "/optional", operation: "ADDED", after: null}], returnedChangeCount: 4, truncated: false,
      currentEffectiveAt: new Date("2026-07-24T12:00:00Z"), previousEffectiveAt: new Date("2026-07-23T12:00:00Z")} } />);
    expect(html).toContain("/title"); expect(html).toContain("Changed"); expect(html).toContain("Added");
    expect(html).toContain("Old"); expect(html).toContain("New"); expect(html).toContain("Missing");
    expect(html).toContain("Change categories"); expect(html).toContain("Product content: 1");
    expect(html).toContain("Variant data: 1"); expect(html).toContain("System metadata: 1");
    expect(html).toContain("Other: 1"); expect(html).toContain("/variants/0/price"); expect(html).toContain("Before");
    expect(html).toContain("Detected signals"); expect(html).toContain("Product title changed: 1");
    expect(html).toContain("Variant price changed: 1"); expect(html).toContain("Product content");
    expect(html).toContain("Comparison findings"); expect(html).toContain("Product identity fields changed");
    expect(html).toContain("Variant pricing fields changed"); expect(html).toContain("Evidence count");
    expect(html).toContain('data-value-kind="null"'); expect(html).not.toContain("secondary-hash"); expect(html).not.toContain("payload");
    for (const excluded of ["severity", "risk", "incident", "recommendation", "recovery", "state hash", "shop identifier"])
      expect(html.toLowerCase()).not.toContain(excluded);
  });

  it("explains non-comparable and truncated comparisons", () => {
    const base = {currentSnapshotId: "current", resourceType: CatalogResourceType.PRODUCT, resourceId: entry.resourceId,
      currentAction: "DELETED" as const, entries: [], returnedChangeCount: 0, currentEffectiveAt: new Date(), truncated: false};
    const tombstone = renderRoute(<CatalogDiffView diff={{...base, status: "DELETED_TOMBSTONE"}} />);
    expect(tombstone).toContain("partial tombstone"); expect(tombstone).not.toContain("Changed paths returned");
    const truncated = renderRoute(<CatalogDiffView diff={{...base, currentAction: "UPDATED", status: "LIMIT_EXCEEDED", truncated: true}} />);
    expect(truncated).toContain("Results are truncated"); expect(truncated).toContain("Signals are based only on the returned structural changes");
    expect(truncated).toContain("No deterministic signals matched the returned structural changes");
    expect(truncated).toContain("Findings are based only on the returned structural changes because the comparison was truncated.");
    expect(truncated).toContain("No deterministic comparison findings matched the returned signals.");
  });

  it("renders collection categories, exact paths, and bounded values", () => {
    const html = renderRoute(<CatalogDiffView diff={{currentSnapshotId: "current", previousSnapshotId: "previous",
      resourceType: CatalogResourceType.COLLECTION, resourceId: "collection-1", status: "COMPARABLE", currentAction: "UPDATED",
      entries: [{path: "/title", operation: "CHANGED", before: "Old", after: "New"},
        {path: "/rules/0/condition", operation: "ADDED", after: "tag"},
        {path: "/image/src", operation: "CHANGED", before: "a", after: "b"},
        {path: "/unknown", operation: "REMOVED", before: true}], returnedChangeCount: 4, truncated: false,
      currentEffectiveAt: new Date("2026-07-24T12:00:00Z"), previousEffectiveAt: new Date("2026-07-23T12:00:00Z")} } />);
    expect(html).toContain("Collection content: 1"); expect(html).toContain("Collection rules: 1");
    expect(html).toContain("Collection media: 1"); expect(html).toContain("Other: 1");
    expect(html).toContain("/rules/0/condition"); expect(html).toContain("tag"); expect(html).toContain("Removed");
    expect(html).toContain("Detected signals"); expect(html).toContain("Collection title changed: 1");
    expect(html).toContain("Collection rules changed: 1"); expect(html).toContain("Collection media changed: 1");
    expect(html).toContain("/unknown");
  });

  it("keeps unmatched structural evidence visible while signals stay allow-listed", () => {
    const html = renderRoute(<CatalogDiffView diff={{currentSnapshotId: "current", previousSnapshotId: "previous",
      resourceType: CatalogResourceType.PRODUCT, resourceId: "product-1", status: "COMPARABLE", currentAction: "UPDATED",
      entries: [{path: "/updated_at", operation: "CHANGED", before: "old", after: "new"},
        {path: "/future_field", operation: "ADDED", after: {nested: true}}], returnedChangeCount: 2, truncated: false,
      currentEffectiveAt: new Date(), previousEffectiveAt: new Date()} } />);
    expect(html).toContain("System metadata"); expect(html).toContain("Other");
    expect(html).toContain("/updated_at"); expect(html).toContain("/future_field");
    expect(html).toContain("No deterministic signals matched the returned structural changes.");
    for (const excluded of ["severity", "priority", "risk", "confidence", "impact", "incident", "recommendation",
      "action required", "safe", "resolved", "webhook payload", "state hash", "shop identity"])
      expect(html.toLowerCase()).not.toContain(excluded);
  });
});
