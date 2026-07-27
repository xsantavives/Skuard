import {CatalogResourceType} from "@prisma/client";
import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createRoutesStub} from "react-router";
import {describe, expect, it, vi} from "vitest";
vi.mock("../shopify.server", () => ({authenticate: {admin: vi.fn()}}));
import {CatalogFindingActivityView, CatalogTimelineView} from "../routes/app.catalog";
import {
  CatalogDiffView,
  CatalogResourceHistoryView,
  HistoricalFindingsView,
} from "../routes/app.catalog.$resourceType.$resourceId";

const entry = {
  id: "snapshot-1",
  resourceType: CatalogResourceType.PRODUCT,
  resourceId: "gid://shopify/Product/1?private=x",
  action: "DELETED" as const,
  sourceTopic: "PRODUCTS_DELETE" as const,
  isDeleted: true,
  occurredAt: null,
  receivedAt: new Date("2026-07-24T12:00:00Z"),
  createdAt: new Date("2026-07-24T12:00:01Z"),
  stateHash: "secondary-hash",
};
const emptySummary = {
  resourceType: CatalogResourceType.PRODUCT,
  resourceId: entry.resourceId,
  requestedComparisonLimit: 10,
  snapshotCount: 1,
  adjacentPairCount: 0,
  comparablePairCount: 0,
  skippedPairCount: 0,
  truncatedComparisonCount: 0,
  findings: [],
  historyExhausted: true,
};

function renderRoute(element: ReactNode) {
  const Stub = createRoutesStub([{path: "/", Component: () => element}]);
  return renderToStaticMarkup(<Stub initialEntries={["/"]} />);
}

describe("merchant catalog routes", () => {
  it("renders separate bounded finding activity, safe exact links, qualification, pagination, and empty states", () => {
    const page = {
      candidateCount: 2,
      comparableCount: 1,
      skippedCount: 1,
      findingBearingCount: 1,
      hasNextPage: true,
      nextCursor: "opaque",
      entries: [
        {
          currentSnapshotId: "snapshot/id",
          resourceType: CatalogResourceType.COLLECTION,
          resourceId: "collection?private=x",
          currentEffectiveAt: new Date("2026-07-25T12:00:00Z"),
          truncated: true,
          findings: [
            {
              code: "COLLECTION_RULES_CHANGED" as const,
              label: "Collection rules changed",
              evidenceCount: 1,
            },
          ],
        },
      ],
    };
    const html = renderRoute(
      <>
        <CatalogTimelineView entries={[entry]} hasNextPage={false} />
        <CatalogFindingActivityView
          page={page}
          search="?cursor=timeline&amp;resourceType=PRODUCT&amp;findingCursor=old"
        />
      </>,
    );
    expect(html).toContain("Catalog activity");
    expect(html).toContain("Recent catalog finding activity");
    expect(html).toContain("Candidates analyzed");
    expect(html).toContain("Comparable updates");
    expect(html).toContain("Collection rules changed");
    expect(html).toContain("1 returned evidence signal");
    expect(html).toContain("findings and returned evidence may be incomplete");
    expect(html).toContain("View comparison");
    expect(html).toContain("collection%3Fprivate%3Dx?snapshot=snapshot%2Fid");
    expect(html).toContain("More finding activity");
    expect(html).toContain("cursor=timeline");
    expect(html).toContain("findingCursor=opaque");
    expect(html).not.toContain("previous");
    expect(html).not.toContain("shop identity");
    expect(
      renderRoute(
        <CatalogFindingActivityView
          page={{
            ...page,
            candidateCount: 0,
            comparableCount: 0,
            skippedCount: 0,
            findingBearingCount: 0,
            hasNextPage: false,
            nextCursor: undefined,
            entries: [],
          }}
        />,
      ),
    ).toContain("No catalog activity is available");
    expect(
      renderRoute(
        <CatalogFindingActivityView
          page={{...page, hasNextPage: false, entries: [], findingBearingCount: 0}}
        />,
      ),
    ).toContain("No deterministic findings matched the recent comparable catalog updates");
  });
  it("renders safe timeline metadata, encoded links, filters, and cursor navigation", () => {
    const html = renderRoute(
      <CatalogTimelineView entries={[entry]} hasNextPage nextCursor="opaque cursor" />,
    );
    expect(html).toContain("Catalog activity");
    expect(html).toContain("Deleted product");
    expect(html).toContain("gid%3A%2F%2Fshopify%2FProduct%2F1%3Fprivate%3Dx");
    expect(html).toContain("Load more");
    expect(html).not.toContain("secondary-hash");
    expect(html).not.toContain("payload");
    expect(html).not.toContain("processing error");
  });

  it("preserves independent finding pagination when advancing the timeline", () => {
    const html = renderRoute(
      <CatalogTimelineView
        entries={[entry]}
        hasNextPage
        nextCursor="next timeline"
        filters={{resourceType: CatalogResourceType.PRODUCT}}
        search="?cursor=old&findingCursor=finding-page&view=compact"
      />,
    );
    const href = html.match(/href="([^"]+)"[^>]*>Load more/)?.[1];

    expect(href).toBe(
      "/?findingCursor=finding-page&amp;view=compact&amp;resourceType=PRODUCT&amp;cursor=next+timeline",
    );
    expect(href?.match(/cursor=/g)).toHaveLength(1);
    expect(href?.match(/findingCursor=/g)).toHaveLength(1);
  });

  it("renders the post-deployment empty state", () => {
    const html = renderRoute(<CatalogTimelineView entries={[]} hasNextPage={false} />);
    expect(html).toContain("No catalog activity yet");
    expect(html).toContain("not backfilled");
  });

  it("renders resource identity, derived status, tombstone history, and back navigation", () => {
    const html = renderRoute(
      <CatalogResourceHistoryView
        history={{
          resourceType: CatalogResourceType.PRODUCT,
          resourceId: entry.resourceId,
          status: "DELETED",
          entries: [entry],
        }}
        historicalFindings={emptySummary}
      />,
    );
    expect(html).toContain("Product history");
    expect(html).toContain("Current status:");
    expect(html).toContain("Deleted");
    expect(html).toContain("Deletion tombstone");
    expect(html).toContain("Back to catalog activity");
    expect(html).not.toContain("secondary-hash");
    expect(html).toContain("View changes");
  });

  it("renders bounded historical findings, qualifications, counts, and neutral empty states", () => {
    const html = renderRoute(
      <HistoricalFindingsView
        summary={{
          ...emptySummary,
          snapshotCount: 11,
          adjacentPairCount: 10,
          comparablePairCount: 7,
          skippedPairCount: 3,
          truncatedComparisonCount: 2,
          historyExhausted: false,
          findings: [
            {
              code: "VARIANT_PRICING_CHANGED",
              label: "Variant pricing fields changed",
              comparisonCount: 2,
              evidenceCount: 3,
              occurrences: [
                {
                  currentSnapshotId: "current/id",
                  previousSnapshotId: "previous-1",
                  currentEffectiveAt: new Date("2026-07-22T12:00:00Z"),
                  previousEffectiveAt: new Date("2026-07-21T12:00:00Z"),
                  evidenceCount: 2,
                  truncated: false,
                },
                {
                  currentSnapshotId: "older?private=x",
                  previousSnapshotId: "previous-2",
                  currentEffectiveAt: new Date("2026-07-19T12:00:00Z"),
                  previousEffectiveAt: new Date("2026-07-18T12:00:00Z"),
                  evidenceCount: 1,
                  truncated: true,
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Recent historical findings");
    expect(html).toContain("most recent 10 adjacent comparisons");
    expect(html).toContain("Older catalog history was not analyzed");
    expect(html).toContain("2 of 7");
    expect(html).toContain(">3<");
    expect(html).toContain(
      "2 analyzed comparisons were structurally truncated; their findings may be incomplete.",
    );
    expect(html).toContain("Historical finding occurrences");
    expect(html).toContain("7/22/2026");
    expect(html).toContain("2 evidence signals");
    expect(html).toContain("1 returned evidence signal — Comparison truncated");
    expect(html).toContain("View comparison");
    expect(html).toContain("?snapshot=current%2Fid");
    expect(html).toContain("?snapshot=older%3Fprivate%3Dx");
    expect(html).not.toContain("previous-1");
    expect(renderRoute(<HistoricalFindingsView summary={emptySummary} />)).toContain(
      "No comparable updates were available",
    );
    const noFindings = renderRoute(
      <HistoricalFindingsView
        summary={{...emptySummary, comparablePairCount: 1, adjacentPairCount: 1}}
      />,
    );
    expect(noFindings).toContain("No deterministic findings matched");
    expect(noFindings).not.toContain("Historical finding occurrences");
    expect(renderRoute(<HistoricalFindingsView summary={emptySummary} />)).not.toContain(
      "Historical finding occurrences",
    );
    for (const excluded of [
      "severity",
      "priority",
      "risk",
      "impact",
      "confidence",
      "score",
      "anomaly",
      "trend",
      "incident",
      "policy",
      "recommendation",
      "action required",
      "safe",
      "acknowledgement",
      "assignment",
      "raw snapshot",
      "webhook payload",
      "hash",
      "shop identity",
    ])
      expect(html.toLowerCase()).not.toContain(excluded);
  });

  it("renders changed paths, labels, bounded values, null, and missing without private state", () => {
    const html = renderRoute(
      <CatalogDiffView
        diff={{
          currentSnapshotId: "current",
          previousSnapshotId: "previous",
          resourceType: CatalogResourceType.PRODUCT,
          resourceId: entry.resourceId,
          status: "COMPARABLE",
          currentAction: "UPDATED",
          entries: [
            {path: "/title", operation: "CHANGED", before: "Old", after: "New"},
            {path: "/variants/0/price", operation: "CHANGED", before: "10", after: "12"},
            {path: "/updated_at", operation: "CHANGED", before: "old date", after: "new date"},
            {path: "/optional", operation: "ADDED", after: null},
          ],
          returnedChangeCount: 4,
          truncated: false,
          currentEffectiveAt: new Date("2026-07-24T12:00:00Z"),
          previousEffectiveAt: new Date("2026-07-23T12:00:00Z"),
        }}
      />,
    );
    expect(html).toContain("/title");
    expect(html).toContain("Changed");
    expect(html).toContain("Added");
    expect(html).toContain("Old");
    expect(html).toContain("New");
    expect(html).toContain("Missing");
    expect(html).toContain("Change categories");
    expect(html).toContain("Product content: 1");
    expect(html).toContain("Variant data: 1");
    expect(html).toContain("System metadata: 1");
    expect(html).toContain("Other: 1");
    expect(html).toContain("/variants/0/price");
    expect(html).toContain("Before");
    expect(html).toContain("Detected signals");
    expect(html).toContain("Product title changed: 1");
    expect(html).toContain("Variant price changed: 1");
    expect(html).toContain("Product content");
    expect(html).toContain("Comparison findings");
    expect(html).toContain("Product identity fields changed");
    expect(html).toContain("Variant pricing fields changed");
    expect(html).toContain("Evidence count");
    expect(html).toContain('data-value-kind="null"');
    expect(html).not.toContain("secondary-hash");
    expect(html).not.toContain("payload");
    for (const excluded of [
      "severity",
      "risk",
      "incident",
      "recommendation",
      "recovery",
      "state hash",
      "shop identifier",
    ])
      expect(html.toLowerCase()).not.toContain(excluded);
  });

  it("explains non-comparable and truncated comparisons", () => {
    const base = {
      currentSnapshotId: "current",
      resourceType: CatalogResourceType.PRODUCT,
      resourceId: entry.resourceId,
      currentAction: "DELETED" as const,
      entries: [],
      returnedChangeCount: 0,
      currentEffectiveAt: new Date(),
      truncated: false,
    };
    const tombstone = renderRoute(
      <CatalogDiffView diff={{...base, status: "DELETED_TOMBSTONE"}} />,
    );
    expect(tombstone).toContain("partial tombstone");
    expect(tombstone).not.toContain("Changed paths returned");
    const truncated = renderRoute(
      <CatalogDiffView
        diff={{...base, currentAction: "UPDATED", status: "LIMIT_EXCEEDED", truncated: true}}
      />,
    );
    expect(truncated).toContain("Results are truncated");
    expect(truncated).toContain("Signals are based only on the returned structural changes");
    expect(truncated).toContain("No deterministic signals matched the returned structural changes");
    expect(truncated).toContain(
      "Findings are based only on the returned structural changes because the comparison was truncated.",
    );
    expect(truncated).toContain(
      "No deterministic comparison findings matched the returned signals.",
    );
  });

  it("renders collection categories, exact paths, and bounded values", () => {
    const html = renderRoute(
      <CatalogDiffView
        diff={{
          currentSnapshotId: "current",
          previousSnapshotId: "previous",
          resourceType: CatalogResourceType.COLLECTION,
          resourceId: "collection-1",
          status: "COMPARABLE",
          currentAction: "UPDATED",
          entries: [
            {path: "/title", operation: "CHANGED", before: "Old", after: "New"},
            {path: "/rules/0/condition", operation: "ADDED", after: "tag"},
            {path: "/image/src", operation: "CHANGED", before: "a", after: "b"},
            {path: "/unknown", operation: "REMOVED", before: true},
          ],
          returnedChangeCount: 4,
          truncated: false,
          currentEffectiveAt: new Date("2026-07-24T12:00:00Z"),
          previousEffectiveAt: new Date("2026-07-23T12:00:00Z"),
        }}
      />,
    );
    expect(html).toContain("Collection content: 1");
    expect(html).toContain("Collection rules: 1");
    expect(html).toContain("Collection media: 1");
    expect(html).toContain("Other: 1");
    expect(html).toContain("/rules/0/condition");
    expect(html).toContain("tag");
    expect(html).toContain("Removed");
    expect(html).toContain("Detected signals");
    expect(html).toContain("Collection title changed: 1");
    expect(html).toContain("Collection rules changed: 1");
    expect(html).toContain("Collection media changed: 1");
    expect(html).toContain("/unknown");
  });

  it("keeps unmatched structural evidence visible while signals stay allow-listed", () => {
    const html = renderRoute(
      <CatalogDiffView
        diff={{
          currentSnapshotId: "current",
          previousSnapshotId: "previous",
          resourceType: CatalogResourceType.PRODUCT,
          resourceId: "product-1",
          status: "COMPARABLE",
          currentAction: "UPDATED",
          entries: [
            {path: "/updated_at", operation: "CHANGED", before: "old", after: "new"},
            {path: "/future_field", operation: "ADDED", after: {nested: true}},
          ],
          returnedChangeCount: 2,
          truncated: false,
          currentEffectiveAt: new Date(),
          previousEffectiveAt: new Date(),
        }}
      />,
    );
    expect(html).toContain("System metadata");
    expect(html).toContain("Other");
    expect(html).toContain("/updated_at");
    expect(html).toContain("/future_field");
    expect(html).toContain("No deterministic signals matched the returned structural changes.");
    for (const excluded of [
      "severity",
      "priority",
      "risk",
      "confidence",
      "impact",
      "incident",
      "recommendation",
      "action required",
      "safe",
      "resolved",
      "webhook payload",
      "state hash",
      "shop identity",
    ])
      expect(html.toLowerCase()).not.toContain(excluded);
  });
});
