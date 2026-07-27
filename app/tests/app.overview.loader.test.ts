import {describe, expect, it, vi} from "vitest";

const {authenticateAdmin, queryTimeline, queryFindings} = vi.hoisted(() => ({
  authenticateAdmin: vi.fn(), queryTimeline: vi.fn(), queryFindings: vi.fn(),
}));

vi.mock("../shopify.server", () => ({authenticate: {admin: authenticateAdmin}}));
vi.mock("../services/catalog-timeline.server", async (original) => ({
  ...await original<typeof import("../services/catalog-timeline.server")>(),
  queryCatalogTimeline: queryTimeline,
}));
vi.mock("../services/catalog-finding-activity.server", async (original) => ({
  ...await original<typeof import("../services/catalog-finding-activity.server")>(),
  queryCatalogFindingActivity: queryFindings,
}));

import {loader} from "../routes/app._index";

describe("catalog overview loader", () => {
  it("authenticates and scopes both bounded reads to the session shop", async () => {
    const request = new Request("https://app.test/app");
    authenticateAdmin.mockResolvedValue({session: {shop: "authenticated.myshopify.com"}});
    queryTimeline.mockResolvedValue({entries: [], hasNextPage: false});
    queryFindings.mockResolvedValue({candidateCount: 0, comparableCount: 0, skippedCount: 0,
      findingBearingCount: 0, entries: [], hasNextPage: false});

    await loader({request, params: {}, context: {}} as never);

    expect(authenticateAdmin).toHaveBeenCalledWith(request);
    expect(queryTimeline).toHaveBeenCalledWith("authenticated.myshopify.com", {limit: 5});
    expect(queryFindings).toHaveBeenCalledWith("authenticated.myshopify.com");
  });
});
