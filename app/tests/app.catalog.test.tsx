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
        {path: "/optional", operation: "ADDED", after: null}], returnedChangeCount: 2, truncated: false,
      currentEffectiveAt: new Date("2026-07-24T12:00:00Z"), previousEffectiveAt: new Date("2026-07-23T12:00:00Z")} } />);
    expect(html).toContain("/title"); expect(html).toContain("Changed"); expect(html).toContain("Added");
    expect(html).toContain("Old"); expect(html).toContain("New"); expect(html).toContain("Missing");
    expect(html).toContain('data-value-kind="null"'); expect(html).not.toContain("secondary-hash"); expect(html).not.toContain("payload");
  });

  it("explains non-comparable and truncated comparisons", () => {
    const base = {currentSnapshotId: "current", resourceType: CatalogResourceType.PRODUCT, resourceId: entry.resourceId,
      currentAction: "DELETED" as const, entries: [], returnedChangeCount: 0, currentEffectiveAt: new Date(), truncated: false};
    const tombstone = renderRoute(<CatalogDiffView diff={{...base, status: "DELETED_TOMBSTONE"}} />);
    expect(tombstone).toContain("partial tombstone"); expect(tombstone).not.toContain("Changed paths returned");
    const truncated = renderRoute(<CatalogDiffView diff={{...base, currentAction: "UPDATED", status: "LIMIT_EXCEEDED", truncated: true}} />);
    expect(truncated).toContain("Results are truncated");
  });
});
