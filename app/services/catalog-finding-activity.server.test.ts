import {CatalogResourceType} from "@prisma/client";
import {describe, expect, it, vi} from "vitest";
import {
  decodeCatalogFindingActivityCursor,
  deriveCatalogFindingActivity,
  encodeCatalogFindingActivityCursor,
  normalizeCatalogFindingActivityLimit,
  queryCatalogFindingActivity,
  type CatalogFindingActivityPair,
} from "./catalog-finding-activity.server";

const time = (day: number) => new Date(`2026-07-${String(day).padStart(2, "0")}T12:00:00.000Z`);
const snapshot = (
  id: string,
  day: number,
  state: object,
  sourceTopic = "PRODUCTS_UPDATE",
  isDeleted = false,
) => ({
  id,
  resourceType: CatalogResourceType.PRODUCT,
  resourceId: "product-1",
  sourceTopic,
  state: JSON.stringify(state),
  isDeleted,
  occurredAt: time(day),
  receivedAt: time(day),
  createdAt: time(day),
});
const pair = (
  id: string,
  day: number,
  current: object,
  previous: object,
): CatalogFindingActivityPair => ({
  current: snapshot(id, day, current),
  previous: snapshot(`${id}-previous`, day - 1, previous),
});
const variantGid = "gid://shopify/ProductVariant/1";

describe("bounded catalog finding activity", () => {
  it("normalizes bounds deterministically", () => {
    expect(normalizeCatalogFindingActivityLimit()).toBe(25);
    expect(normalizeCatalogFindingActivityLimit(99)).toBe(50);
    for (const invalid of [0, -1, 1.5, Number.NaN])
      expect(normalizeCatalogFindingActivityLimit(invalid)).toBe(25);
  });

  it("uses exactly one bounded shop-scoped repository operation", async () => {
    const findRecentPairs = vi.fn().mockResolvedValue([]);
    await queryCatalogFindingActivity("one.myshopify.com", {limit: 50}, {findRecentPairs});
    expect(findRecentPairs).toHaveBeenCalledOnce();
    expect(findRecentPairs).toHaveBeenCalledWith({
      shop: "one.myshopify.com",
      take: 51,
      before: undefined,
    });
  });

  it("round trips a shop-free cursor and rejects malformed, invalid, and oversized cursors", () => {
    const current = snapshot("same-time-id", 20, {});
    const encoded = encodeCatalogFindingActivityCursor(current);
    expect(decodeCatalogFindingActivityCursor(encoded)).toEqual({
      effectiveAt: time(20).toISOString(),
      receivedAt: time(20).toISOString(),
      createdAt: time(20).toISOString(),
      id: "same-time-id",
    });
    expect(Buffer.from(encoded, "base64url").toString()).not.toContain("shop");
    expect(decodeCatalogFindingActivityCursor("bad")).toBeUndefined();
    expect(decodeCatalogFindingActivityCursor("x".repeat(2049))).toBeUndefined();
    expect(
      decodeCatalogFindingActivityCursor(
        Buffer.from(
          JSON.stringify({
            effectiveAt: "invalid",
            receivedAt: "invalid",
            createdAt: "invalid",
            id: "x",
          }),
        ).toString("base64url"),
      ),
    ).toBeUndefined();
  });

  it("groups fixed-order findings, preserves evidence counts, and keeps counts invariant", () => {
    const result = deriveCatalogFindingActivity(
      [
        pair(
          "new",
          20,
          {title: "New", status: "active", variants: [{id: variantGid, price: "12", compare_at_price: null, sku: "B"}], variant_gids: [variantGid]},
          {title: "Old", status: "draft", variants: [{id: variantGid, price: "10", compare_at_price: null, sku: "A"}], variant_gids: [variantGid]},
        ),
      ],
      25,
    );
    expect(result).toMatchObject({
      candidateCount: 1,
      comparableCount: 1,
      skippedCount: 0,
      findingBearingCount: 1,
      hasNextPage: false,
    });
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.findings.map((finding) => finding.code)).toEqual([
      "PRODUCT_IDENTITY_CHANGED",
      "PRODUCT_PUBLICATION_CHANGED",
      "VARIANT_PRICING_CHANGED",
      "VARIANT_IDENTIFIERS_CHANGED",
      "PRODUCT_IDENTITY_AND_PUBLICATION_CHANGED",
    ]);
    expect(result.entries[0]!.findings[0]!.evidenceCount).toBe(1);
    const pricing = result.entries[0]!.findings.find(({code}) => code === "VARIANT_PRICING_CHANGED")!;
    expect(pricing).toMatchObject({pricingCoverageStatus: "COMPLETE", pricingEvidenceLimited: false,
      pricingChangesTruncated: false});
    for (const nonPricing of result.entries[0]!.findings.filter(({code}) => code !== "VARIANT_PRICING_CHANGED"))
      expect(nonPricing).not.toHaveProperty("pricingCoverageStatus");
  });

  it("copies PARTIAL and UNVERIFIED qualification without changing candidate pagination counts", () => {
    const partial = pair("partial", 22,
      {variants: [{id: variantGid, price: "2", compare_at_price: null}], variant_gids: [variantGid, "gid://shopify/ProductVariant/2"]},
      {variants: [{id: variantGid, price: "1", compare_at_price: null}], variant_gids: [variantGid, "gid://shopify/ProductVariant/2"]});
    const unverified = pair("unverified", 21,
      {variants: [{id: variantGid, price: "2", compare_at_price: null}]},
      {variants: [{id: variantGid, price: "1", compare_at_price: null}]});
    const beyond = pair("beyond", 20, {title: "new"}, {title: "old"});
    const result = deriveCatalogFindingActivity([beyond, unverified, partial], 2);
    expect(result).toMatchObject({candidateCount: 2, comparableCount: 2, skippedCount: 0,
      findingBearingCount: 2, hasNextPage: true});
    expect(result.entries.map((entry) => entry.findings[0]?.pricingCoverageStatus)).toEqual(["PARTIAL", "UNVERIFIED"]);
  });

  it("does not bypass tombstones and counts zero-finding comparable candidates without emitting", () => {
    const tombstone = pair("after-delete", 22, {title: "New"}, {id: 1});
    tombstone.previous = snapshot("delete", 21, {id: 1}, "PRODUCTS_DELETE", true);
    const zero = pair("metadata", 20, {updated_at: "new"}, {updated_at: "old"});
    const result = deriveCatalogFindingActivity([tombstone, zero], 25);
    expect(result).toMatchObject({
      candidateCount: 2,
      comparableCount: 1,
      skippedCount: 1,
      findingBearingCount: 0,
      entries: [],
    });
  });

  it("bounds candidates without filling entries and cursors from the final analyzed candidate", () => {
    const finding = pair("finding", 22, {title: "New"}, {title: "Old"});
    const skipped = {current: snapshot("skipped", 21, {}, "PRODUCTS_CREATE"), previous: null};
    const older = pair("older", 20, {title: "New"}, {title: "Old"});
    const result = deriveCatalogFindingActivity([older, skipped, finding], 2);
    expect(result.candidateCount).toBe(2);
    expect(result.entries).toHaveLength(1);
    expect(result.hasNextPage).toBe(true);
    expect(decodeCatalogFindingActivityCursor(result.nextCursor)?.id).toBe("skipped");
  });

  it("fails closed for creations, tombstones, unsupported topics, invalid JSON, and absent predecessors", () => {
    const cases: CatalogFindingActivityPair[] = [
      {current: snapshot("creation", 20, {}, "PRODUCTS_CREATE"), previous: snapshot("old", 19, {})},
      {
        current: snapshot("delete", 18, {}, "PRODUCTS_DELETE", true),
        previous: snapshot("old2", 17, {}),
      },
      {
        current: snapshot("unsupported", 16, {}, "ORDERS_UPDATE"),
        previous: snapshot("old3", 15, {}),
      },
      {current: {...snapshot("invalid", 14, {}), state: "{"}, previous: snapshot("old4", 13, {})},
      {current: snapshot("first", 12, {}), previous: null},
    ];
    const result = deriveCatalogFindingActivity(cases, 25);
    expect(result).toMatchObject({
      candidateCount: 5,
      comparableCount: 0,
      skippedCount: 5,
      entries: [],
    });
  });

  it("copies and orders repository input without mutation", () => {
    const input = [
      pair("older", 19, {title: "B"}, {title: "A"}),
      pair("newer", 20, {title: "D"}, {title: "C"}),
    ];
    const original = [...input];
    expect(
      deriveCatalogFindingActivity(input, 25).entries.map((entry) => entry.currentSnapshotId),
    ).toEqual(["newer", "older"]);
    expect(input).toEqual(original);
    expect(deriveCatalogFindingActivity(input, 25)).toEqual(
      deriveCatalogFindingActivity(input, 25),
    );
  });
});
