import {CatalogResourceType} from "@prisma/client";
import {AppProvider} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import {renderToStaticMarkup} from "react-dom/server";
import {createRoutesStub} from "react-router";
import {describe, expect, it, vi} from "vitest";

vi.mock("../shopify.server", () => ({authenticate: {admin: vi.fn()}}));
import {CatalogOverview} from "../routes/app._index";
import {merchantNavigation} from "../routes/app";
import type {CatalogFindingActivityPage} from "../services/catalog-finding-activity.server";

const findings: CatalogFindingActivityPage = {candidateCount: 0, comparableCount: 0, skippedCount: 0,
  findingBearingCount: 0, entries: [], hasNextPage: false};

function renderOverview(entries: Parameters<typeof CatalogOverview>[0]["entries"], page = findings) {
  const Stub = createRoutesStub([{path: "/", Component: () => <CatalogOverview entries={entries} findings={page} />}]);
  return renderToStaticMarkup(<AppProvider i18n={enTranslations}><Stub /></AppProvider>);
}

describe("merchant overview", () => {
  it("exposes only the two merchant navigation destinations", () => {
    expect(merchantNavigation.map(({label}) => label)).toEqual(["Overview", "Catalog activity"]);
    expect(merchantNavigation.map(({href}) => href)).toEqual(["/app", "/app/catalog"]);
    expect(merchantNavigation.map(({label}) => String(label))).not.toContain("Diagnostics");
  });

  it("renders the truthful waiting state without activity", () => {
    const html = renderOverview([]);
    expect(html).toContain("Catalog overview");
    expect(html).toContain("Waiting for catalog activity");
    expect(html).toContain("Previous activity is not backfilled");
  });

  it("renders recent evidence and findings in merchant language", () => {
    const entry = {id: "snapshot-1", resourceType: CatalogResourceType.PRODUCT,
      resourceId: "gid://shopify/Product/1?private=x", action: "UPDATED" as const,
      sourceTopic: "PRODUCTS_UPDATE" as const, isDeleted: false, occurredAt: null,
      receivedAt: new Date("2026-07-27T12:00:00Z"), createdAt: new Date("2026-07-27T12:00:01Z"),
      stateHash: "not-rendered"};
    const html = renderOverview([entry], {...findings, candidateCount: 1, comparableCount: 1,
      findingBearingCount: 1, entries: [{currentSnapshotId: entry.id,
        resourceType: entry.resourceType, resourceId: entry.resourceId,
        currentEffectiveAt: entry.receivedAt, truncated: false,
        findings: [{code: "PRODUCT_IDENTITY_CHANGED" as const, label: "Product identity fields changed", evidenceCount: 1}]}]});
    expect(html).toContain("Findings detected");
    expect(html).toContain("Product updated");
    expect(html).toContain("Product identity fields changed");
    expect(html).toContain("gid%3A%2F%2Fshopify%2FProduct%2F1%3Fprivate%3Dx");
    for (const term of ["Candidates analyzed", "Comparable updates", "Skipped candidates",
      "bounded recent candidate window", "immutable catalog snapshots", "payload hash", "state hash"])
      expect(html).not.toContain(term);
  });
});
