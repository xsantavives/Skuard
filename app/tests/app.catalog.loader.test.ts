import {beforeEach, describe, expect, it, vi} from "vitest";

const {authenticateAdmin, queryTimeline, queryActivity, queryOverview} = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(), queryTimeline: vi.fn(), queryActivity: vi.fn(), queryOverview: vi.fn(),
}));

vi.mock("../shopify.server", () => ({authenticate: {admin: authenticateAdmin}}));
vi.mock("../services/catalog-timeline.server", async (original) => ({
  ...await original<typeof import("../services/catalog-timeline.server")>(),
  queryCatalogTimeline: queryTimeline,
}));
vi.mock("../services/catalog-finding-activity.server", async (original) => ({
  ...await original<typeof import("../services/catalog-finding-activity.server")>(),
  queryCatalogFindingActivity: queryActivity,
}));
vi.mock("../services/catalog-detection-overview.server", async (original) => ({
  ...await original<typeof import("../services/catalog-detection-overview.server")>(),
  queryCatalogDetectionOverview: queryOverview,
}));

import {loader} from "../routes/app.catalog";

describe("catalog route detection overview loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authenticateAdmin.mockResolvedValue({session: {shop: "authenticated.myshopify.com"}});
    queryTimeline.mockResolvedValue({entries: [], hasNextPage: false});
    queryActivity.mockResolvedValue({candidateCount: 0, comparableCount: 0, skippedCount: 0,
      findingBearingCount: 0, entries: [], hasNextPage: false});
    queryOverview.mockResolvedValue({candidateCount: 0, comparableCount: 0, skippedCount: 0,
      groups: [], hasNextPage: false});
  });

  it("authenticates before reads and passes only session shop, valid filters, and one cursor", async () => {
    const request = new Request("https://app.test/app/catalog?resourceType=PRODUCT&findingCode=PRODUCT_IDENTITY_CHANGED&overviewCursor=opaque");
    await loader({request, params: {}, context: {}} as never);
    expect(authenticateAdmin).toHaveBeenCalledWith(request);
    expect(authenticateAdmin.mock.invocationCallOrder[0]).toBeLessThan(queryOverview.mock.invocationCallOrder[0]!);
    expect(queryOverview).toHaveBeenCalledWith("authenticated.myshopify.com", {
      cursor: "opaque", filters: {resourceType: "PRODUCT", findingCode: "PRODUCT_IDENTITY_CHANGED"},
    });
  });

  it("normalizes arbitrary and duplicate overview values before the service", async () => {
    await loader({request: new Request("https://app.test/app/catalog?resourceType=product&findingCode=sql&overviewCursor=a&overviewCursor=b"),
      params: {}, context: {}} as never);
    expect(queryOverview).toHaveBeenCalledWith("authenticated.myshopify.com", {cursor: undefined, filters: {}});
  });
});
