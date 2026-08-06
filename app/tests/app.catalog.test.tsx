import {CatalogResourceType} from "@prisma/client";
import type {ReactNode} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {createRoutesStub} from "react-router";
import {AppProvider} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import {describe, expect, it, vi} from "vitest";
vi.mock("../shopify.server", () => ({authenticate: {admin: vi.fn()}}));
import {CatalogDetectionOverviewView, CatalogFindingActivityView, CatalogTimelineView} from "../routes/app.catalog";
import {
  CatalogDiffView,
  CatalogResourceHistoryView,
  HistoricalFindingsView,
} from "../routes/app.catalog.$resourceType.$resourceId";
import {analyzeCatalogComparison} from "../services/catalog-comparison-analysis";
import type {CatalogStructuralDiff} from "../services/catalog-diff.server";
import type {JsonValue} from "../services/catalog-structural-diff";

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
  return renderToStaticMarkup(<AppProvider i18n={enTranslations}><Stub initialEntries={["/"]} /></AppProvider>);
}

const exactComparison = (resourceType: CatalogResourceType, previous: JsonValue, current: JsonValue,
  limits: Parameters<typeof analyzeCatalogComparison>[3] = {}): CatalogStructuralDiff => {
  const analysis = analyzeCatalogComparison(resourceType, previous, current, limits);
  const base = {currentSnapshotId: "current", previousSnapshotId: "previous", resourceType,
    resourceId: resourceType === CatalogResourceType.PRODUCT ? entry.resourceId : "collection-1",
    status: analysis.structural.truncated ? "LIMIT_EXCEEDED" as const : "COMPARABLE" as const,
    currentAction: "UPDATED" as const, entries: analysis.structural.entries,
    returnedChangeCount: analysis.structural.entries.length, truncated: analysis.structural.truncated,
    currentEffectiveAt: new Date("2026-07-24T12:00:00Z"), previousEffectiveAt: new Date("2026-07-23T12:00:00Z"),
    signals: analysis.signals, findings: analysis.findings};
  return resourceType === CatalogResourceType.PRODUCT && analysis.pricing
    ? {...base, resourceType: CatalogResourceType.PRODUCT, pricingChanges: analysis.pricing.changes,
      pricingCoverage: analysis.pricing.coverage}
    : {...base, resourceType: CatalogResourceType.COLLECTION} as CatalogStructuralDiff;
};

describe("merchant catalog routes", () => {
  it("renders factual bounded detection groups, encoded drilldown, three qualifications, and independent pagination", () => {
    const html = renderRoute(<CatalogDetectionOverviewView search="?cursor=time&page=x&findingCursor=activity&overviewCursor=old&overviewCursor=duplicate&resourceType=COLLECTION&findingCode=COLLECTION_RULES_CHANGED"
      filters={{resourceType: CatalogResourceType.COLLECTION, findingCode: "COLLECTION_RULES_CHANGED"}}
      page={{candidateCount: 25, comparableCount: 20, skippedCount: 5, hasNextPage: true, nextCursor: "next overview",
        groups: [{code: "COLLECTION_RULES_CHANGED", label: "Collection rules changed", comparisonCount: 12,
          distinctResourceCount: 8, returnedEvidenceCount: 27, structurallyTruncatedComparisonCount: 3,
          latestOccurrence: {currentSnapshotId: "snapshot/id?x", resourceType: CatalogResourceType.COLLECTION,
            resourceId: "gid://Collection/a?x", effectiveAt: new Date("2026-07-26T12:00:00Z"),
            returnedEvidenceCount: 2, structurallyTruncated: true},
          occurrences: [{currentSnapshotId: "snapshot/id?x", resourceType: CatalogResourceType.COLLECTION,
            resourceId: "gid://Collection/a?x", effectiveAt: new Date("2026-07-26T12:00:00Z"),
            returnedEvidenceCount: 2, structurallyTruncated: true}], occurrencesTruncated: true}]}} />);
    expect(html).toContain("Changes to inspect");
    expect(html).toContain("12 recent changes"); expect(html).toContain("8 resources");
    expect(html).toContain("Most recently detected");
    expect(html).toContain("Some contributing changes reached the review limit");
    expect(html).toContain("Additional recent occurrences"); expect(html).toContain("not a catalog-wide total");
    expect(html).toContain("COLLECTION/gid%3A%2F%2FCollection%2Fa%3Fx?snapshot=snapshot%2Fid%3Fx");
    const href = html.match(/href="([^"]+)"[^>]*>Review older changes/)?.[1];
    expect(href).toContain("cursor=time"); expect(href).toContain("findingCursor=activity");
    expect(href).toContain("overviewCursor=next+overview"); expect(href?.match(/overviewCursor=/g)).toHaveLength(1);
    for (const excluded of ["severity", "risk", "trend", "anomaly", "incident", "policy", "recommendation", "recovery", "webhook payload", "state hash", "access token", "shop identity"])
      expect(html.toLowerCase()).not.toContain(excluded);
  });

  it("renders bounded pricing overview counts and omits them from non-pricing groups", () => {
    const occurrence = {currentSnapshotId: "pricing", resourceType: CatalogResourceType.PRODUCT,
      resourceId: "product-1", effectiveAt: new Date("2026-07-26T12:00:00Z"), returnedEvidenceCount: 2,
      structurallyTruncated: false, pricingCoverageStatus: "PARTIAL" as const, pricingEvidenceLimited: true,
      pricingChangesTruncated: true};
    const html = renderRoute(<CatalogDetectionOverviewView page={{candidateCount: 4, comparableCount: 4,
      skippedCount: 0, hasNextPage: false, groups: [
        {code: "VARIANT_PRICING_CHANGED", label: "Variant pricing fields changed", comparisonCount: 3,
          distinctResourceCount: 2, returnedEvidenceCount: 4, structurallyTruncatedComparisonCount: 0,
          completePricingComparisonCount: 1, partialPricingComparisonCount: 1, unverifiedPricingComparisonCount: 1,
          pricingEvidenceLimitedComparisonCount: 1, pricingChangesTruncatedComparisonCount: 1,
          latestOccurrence: occurrence, occurrences: [occurrence], occurrencesTruncated: false},
        {code: "PRODUCT_IDENTITY_CHANGED", label: "Product identity fields changed", comparisonCount: 1,
          distinctResourceCount: 1, returnedEvidenceCount: 1, structurallyTruncatedComparisonCount: 0,
          latestOccurrence: {...occurrence, currentSnapshotId: "identity", pricingCoverageStatus: undefined,
            pricingEvidenceLimited: undefined, pricingChangesTruncated: undefined},
          occurrences: [{...occurrence, currentSnapshotId: "identity", pricingCoverageStatus: undefined,
            pricingEvidenceLimited: undefined, pricingChangesTruncated: undefined}], occurrencesTruncated: false},
      ]}} />);
    expect(html).toContain("Within this bounded candidate window: 1 complete, 1 partial, and 1 unverified");
    expect(html).toContain("1 reached a pricing evidence limit");
    expect(html).toContain("1 had additional pricing changes not returned");
    expect(html.match(/Within this bounded candidate window/g)).toHaveLength(1);
  });

  it("renders detection empty state and resets its cursor when filters are submitted", () => {
    const html = renderRoute(<CatalogDetectionOverviewView search="?cursor=time&findingCursor=activity&overviewCursor=old&view=compact"
      page={{candidateCount: 1, comparableCount: 1, skippedCount: 0, groups: [], hasNextPage: false}} />);
    expect(html).toContain("No findings in recent activity");
    const form = html.match(/<form[^>]*>([\s\S]*?)<\/form>/)?.[1] ?? "";
    expect(form).not.toContain('name="overviewCursor"');
    expect(form).toContain('name="cursor"'); expect(form).toContain('name="findingCursor"');
  });

  it("drops malformed duplicate non-target cursors from independent pagination links", () => {
    const overview = renderRoute(<CatalogDetectionOverviewView
      search="?cursor=one&cursor=two&findingCursor=activity&overviewCursor=old"
      page={{candidateCount: 1, comparableCount: 1, skippedCount: 0, groups: [], hasNextPage: true,
        nextCursor: "next"}} />);
    const overviewHref = overview.match(/href="([^"]+)"[^>]*>Review older changes/)?.[1];
    expect(overviewHref).not.toMatch(/(?:\?|&amp;)cursor=/);
    expect(overviewHref).toContain("findingCursor=activity");
    expect(overviewHref).toContain("overviewCursor=next");

    const activity = renderRoute(<CatalogFindingActivityView search="?cursor=timeline&overviewCursor=a&overviewCursor=b"
      page={{candidateCount: 1, comparableCount: 0, skippedCount: 1, findingBearingCount: 0,
        entries: [], hasNextPage: true, nextCursor: "next"}} />);
    const activityHref = activity.match(/href="([^"]+)"[^>]*>More finding activity/)?.[1];
    expect(activityHref).toContain("cursor=timeline");
    expect(activityHref).not.toContain("overviewCursor");
    expect(activityHref).toContain("findingCursor=next");
  });

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
          search="?cursor=timeline&amp;resourceType=PRODUCT&amp;findingCursor=old&amp;findingCursor=duplicate&amp;overviewCursor=overview"
        />
      </>,
    );
    expect(html).toContain("Catalog activity");
    expect(html).toContain("Recent findings");
    expect(html).toContain("Collection rules changed");
    expect(html).toContain("1 returned evidence signal");
    expect(html).toContain("findings and returned evidence may be incomplete");
    expect(html).toContain("View comparison");
    expect(html).toContain("collection%3Fprivate%3Dx?snapshot=snapshot%2Fid");
    expect(html).toContain("More finding activity");
    expect(html).toContain("cursor=timeline");
    expect(html).toContain("findingCursor=opaque");
    expect(html).toContain("overviewCursor=overview");
    expect(html.match(/findingCursor=opaque/g)).toHaveLength(1);
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
    ).toContain("Findings will appear after catalog activity is recorded");
    expect(
      renderRoute(
        <CatalogFindingActivityView
          page={{...page, hasNextPage: false, entries: [], findingBearingCount: 0}}
        />,
      ),
    ).toContain("No findings in recent activity");
  });

  it("qualifies only pricing findings in mixed finding activity", () => {
    const html = renderRoute(<CatalogFindingActivityView page={{candidateCount: 1, comparableCount: 1,
      skippedCount: 0, findingBearingCount: 1, hasNextPage: false, entries: [{currentSnapshotId: "current",
        resourceType: CatalogResourceType.PRODUCT, resourceId: "product-1", currentEffectiveAt: new Date(),
        truncated: false, findings: [
          {code: "PRODUCT_IDENTITY_CHANGED", label: "Product identity fields changed", evidenceCount: 1},
          {code: "VARIANT_PRICING_CHANGED", label: "Variant pricing fields changed", evidenceCount: 1,
            pricingCoverageStatus: "UNVERIFIED", pricingEvidenceLimited: true, pricingChangesTruncated: true},
        ]}]}} />);
    expect(html).toContain("Pricing completeness unverified");
    expect(html).toContain("Pricing evidence limit reached");
    expect(html).toContain("Additional pricing changes not returned");
    expect(html.match(/Pricing completeness unverified/g)).toHaveLength(1);
  });
  it("renders safe timeline metadata, encoded links, filters, and cursor navigation", () => {
    const html = renderRoute(
      <CatalogTimelineView entries={[entry]} hasNextPage nextCursor="opaque cursor" />,
    );
    expect(html).toContain("Catalog activity");
    expect(html).toContain("Product deleted");
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
        search="?cursor=old&cursor=duplicate&findingCursor=finding-page&overviewCursor=overview-page&view=compact"
      />,
    );
    const href = [...html.matchAll(/href="([^"]+)"/g)]
      .map((match) => match[1]).find((value) => value?.includes("cursor=next+timeline"));

    expect(href).toBe(
      "?findingCursor=finding-page&amp;overviewCursor=overview-page&amp;view=compact&amp;resourceType=PRODUCT&amp;cursor=next+timeline",
    );
    expect(href?.match(/cursor=/g)).toHaveLength(1);
    expect(href?.match(/findingCursor=/g)).toHaveLength(1);
    expect(href?.match(/overviewCursor=/g)).toHaveLength(1);
  });

  it("renders the post-deployment empty state", () => {
    const html = renderRoute(<CatalogTimelineView entries={[]} hasNextPage={false} />);
    expect(html).toContain("Waiting for catalog activity");
    expect(html).toContain("not backfilled");
  });

  it("distinguishes filtered emptiness and provides a reset path", () => {
    const html = renderRoute(<CatalogTimelineView entries={[]} hasNextPage={false}
      filters={{resourceType: CatalogResourceType.PRODUCT}} />);
    expect(html).toContain("No activity matches these filters");
    expect(html).toContain("Reset filters");
    expect(html).not.toContain("Previous activity is not backfilled");
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
    expect(html).toContain("(Deleted)");
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
              completePricingComparisonCount: 0,
              partialPricingComparisonCount: 1,
              unverifiedPricingComparisonCount: 1,
              pricingEvidenceLimitedComparisonCount: 1,
              pricingChangesTruncatedComparisonCount: 1,
              occurrences: [
                {
                  currentSnapshotId: "current/id",
                  previousSnapshotId: "previous-1",
                  currentEffectiveAt: new Date("2026-07-22T12:00:00Z"),
                  previousEffectiveAt: new Date("2026-07-21T12:00:00Z"),
                  evidenceCount: 2,
                  truncated: false,
                  pricingCoverageStatus: "PARTIAL",
                  pricingEvidenceLimited: false,
                  pricingChangesTruncated: false,
                },
                {
                  currentSnapshotId: "older?private=x",
                  previousSnapshotId: "previous-2",
                  currentEffectiveAt: new Date("2026-07-19T12:00:00Z"),
                  previousEffectiveAt: new Date("2026-07-18T12:00:00Z"),
                  evidenceCount: 1,
                  truncated: true,
                  pricingCoverageStatus: "UNVERIFIED",
                  pricingEvidenceLimited: true,
                  pricingChangesTruncated: true,
                },
              ],
            },
          ],
        }}
      />,
    );
    expect(html).toContain("Findings in recent history");
    expect(html).toContain("up to 10 recent recorded changes");
    expect(html).toContain("Older catalog history is not included");
    expect(html).toContain("2 of 7");
    expect(html).toContain(">3<");
    expect(html).toContain(
      "2 analyzed comparisons were structurally truncated; their findings may be incomplete.",
    );
    expect(html).toContain("Historical finding occurrences");
    expect(html).toContain("7/22/2026");
    expect(html).toContain("2 evidence signals");
    expect(html).toContain("1 returned evidence signal — Comparison truncated");
    expect(html).toContain("0 complete, 1 partial, and 1 unverified pricing comparisons");
    expect(html).toContain("Partial pricing evidence");
    expect(html).toContain("Pricing completeness unverified");
    expect(html).toContain("Pricing evidence limit reached");
    expect(html).toContain("Additional pricing changes not returned");
    expect(html).toContain("View comparison");
    expect(html).toContain("?snapshot=current%2Fid");
    expect(html).toContain("?snapshot=older%3Fprivate%3Dx");
    expect(html).not.toContain("previous-1");
    expect(renderRoute(<HistoricalFindingsView summary={emptySummary} />)).toContain(
      "Comparison requires more than one recorded state",
    );
    const noFindings = renderRoute(
      <HistoricalFindingsView
        summary={{...emptySummary, comparablePairCount: 1, adjacentPairCount: 1}}
      />,
    );
    expect(noFindings).toContain("No findings were detected");
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
    const variantId = "gid://shopify/ProductVariant/1";
    const html = renderRoute(
      <CatalogDiffView
        diff={exactComparison(CatalogResourceType.PRODUCT,
          {title: "Old", variants: [{id: variantId, title: "Small", sku: "SKU-1", price: "10", compare_at_price: null}],
            variant_gids: [variantId], updated_at: "old date"},
          {title: "New", variants: [{id: variantId, title: "Small", sku: "SKU-1", price: "12", compare_at_price: null}],
            variant_gids: [variantId], updated_at: "new date", optional: null})}
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
    expect(html).toContain("Detected changes");
    expect(html).toContain("Product title changed: 1");
    expect(html).toContain("Product content");
    expect(html).toContain("Findings");
    expect(html).toContain("Product identity fields changed");
    expect(html).toContain("Evidence count");
    expect(html).toContain(variantId);
    expect(html).toContain("Small"); expect(html).toContain("SKU-1");
    expect(html).toContain("Price"); expect(html).toContain("Changed");
    expect(html).not.toContain("$");
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
    expect(tombstone).toContain("deletion record");
    expect(tombstone).not.toContain("Changed paths returned");
    const truncated = renderRoute(
      <CatalogDiffView
        diff={exactComparison(CatalogResourceType.PRODUCT, {title: "old", variants: [], variant_gids: []},
          {title: "new", variants: [], variant_gids: []}, {structural: {maxDepth: 32, maxVisitedNodes: 20_000, maxEntries: 0}})}
      />,
    );
    expect(truncated).toContain("Results are truncated");
    expect(truncated).toContain("Detected changes are based only on the fields returned");
    expect(truncated).toContain("No notable change patterns matched");
    expect(truncated).toContain(
      "Findings are based only on the fields returned",
    );
    expect(truncated).toContain(
      "No findings were detected in this comparison.",
    );
  });

  it("renders collection categories, exact paths, and bounded values", () => {
    const html = renderRoute(
      <CatalogDiffView
        diff={exactComparison(CatalogResourceType.COLLECTION,
          {title: "Old", rules: [{condition: "old"}], image: {src: "a"}, unknown: true},
          {title: "New", rules: [{condition: "tag"}], image: {src: "b"}})}
      />,
    );
    expect(html).toContain("Collection content: 1");
    expect(html).toContain("Collection rules: 1");
    expect(html).toContain("Collection media: 1");
    expect(html).toContain("Other: 1");
    expect(html).toContain("/rules/0/condition");
    expect(html).toContain("tag");
    expect(html).toContain("Removed");
    expect(html).toContain("Detected changes");
    expect(html).toContain("Collection title changed: 1");
    expect(html).toContain("Collection rules changed: 1");
    expect(html).toContain("Collection media changed: 1");
    expect(html).toContain("/unknown");
    expect(html).not.toContain("Pricing changes");
  });

  it("keeps unmatched structural evidence visible while signals stay allow-listed", () => {
    const html = renderRoute(
      <CatalogDiffView
        diff={exactComparison(CatalogResourceType.PRODUCT,
          {updated_at: "old", variants: [], variant_gids: []},
          {updated_at: "new", future_field: {nested: true}, variants: [], variant_gids: []})}
      />,
    );
    expect(html).toContain("System metadata");
    expect(html).toContain("Other");
    expect(html).toContain("/updated_at");
    expect(html).toContain("/future_field");
    expect(html).toContain("No notable change patterns matched the reviewed fields.");
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

  it("renders identity-aware pricing transitions and coverage-specific no-change copy", () => {
    const ids = [1, 2, 3].map((id) => `gid://shopify/ProductVariant/${id}`);
    const before = {variants: [
      {id: ids[0], title: "Named variant", sku: "MERCHANT-SKU", price: "10.00", compare_at_price: null},
      {id: ids[1], title: "Set compare", sku: null, price: "20", compare_at_price: null},
      {id: ids[2], title: "Clear compare", sku: "", price: "30", compare_at_price: "40"},
    ], variant_gids: ids};
    const after = {variants: [
      {id: ids[0], title: "Named variant", sku: "MERCHANT-SKU", price: "11", compare_at_price: null},
      {id: ids[1], title: "Set compare", sku: null, price: "20", compare_at_price: "25"},
      {id: ids[2], title: "Clear compare", sku: "", price: "30", compare_at_price: null},
    ], variant_gids: ids};
    const changed = renderRoute(<CatalogDiffView diff={exactComparison(CatalogResourceType.PRODUCT, before, after)} />);
    expect(changed).toContain("Named variant"); expect(changed).toContain("MERCHANT-SKU");
    expect(changed).toContain(ids[0]!); expect(changed).toContain("Compare-at price");
    expect(changed).toContain("Set"); expect(changed).toContain("Cleared"); expect(changed).toContain("—");
    expect(changed).not.toContain("$");

    const complete = renderRoute(<CatalogDiffView diff={exactComparison(CatalogResourceType.PRODUCT, before, before)} />);
    expect(complete).toContain("No price or compare-at price changes were found in this comparison.");
    const partialState = {variants: before.variants.slice(0, 2), variant_gids: ids};
    const partial = renderRoute(<CatalogDiffView diff={exactComparison(CatalogResourceType.PRODUCT, partialState, partialState)} />);
    expect(partial).toContain("No pricing changes were found among represented variants");
    const unverifiedState = {variants: before.variants};
    const unverified = renderRoute(<CatalogDiffView diff={exactComparison(CatalogResourceType.PRODUCT, unverifiedState, unverifiedState)} />);
    expect(unverified).toContain("pricing completeness cannot be established");

    const limited = renderRoute(<CatalogDiffView diff={exactComparison(CatalogResourceType.PRODUCT, before, after,
      {pricing: {maxVariantDetails: 250, maxExpectedVariantIds: 500, maxChanges: 1}})} />);
    expect(limited).toContain("pricing-specific safety limit");
    expect(limited).toContain("Additional identity-matched pricing changes were not returned");
    expect(limited).not.toContain("Results are truncated");
  });
});
