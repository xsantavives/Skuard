import type {LoaderFunctionArgs} from "react-router";
import {Form, Link, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {
  queryCatalogFindingActivity,
  type CatalogFindingActivityPage,
} from "../services/catalog-finding-activity.server";
import {
  parseTimelineFilters,
  queryCatalogTimeline,
  type CatalogTimelineAction,
  type CatalogTimelineEntry,
} from "../services/catalog-timeline.server";
import type {CatalogTimelineFilters} from "../services/catalog-timeline.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = parseTimelineFilters(url.searchParams);
  const [page, findingActivity] = await Promise.all([
    queryCatalogTimeline(session.shop, {cursor: url.searchParams.get("cursor"), filters}),
    queryCatalogFindingActivity(session.shop, {cursor: url.searchParams.get("findingCursor")}),
  ]);
  return {page, filters, findingActivity, search: url.search};
};

const ACTION_LABELS: Record<CatalogTimelineAction, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  DELETED: "Deleted",
};

const effectiveTime = (entry: CatalogTimelineEntry) => entry.occurredAt ?? entry.receivedAt;

export function CatalogTimelineView({
  entries,
  hasNextPage,
  nextCursor,
  filters = {},
}: {
  entries: CatalogTimelineEntry[];
  hasNextPage: boolean;
  nextCursor?: string;
  filters?: CatalogTimelineFilters;
}) {
  const moreParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) {
      const queryKey = key === "sourceTopic" ? "topic" : key === "isDeleted" ? "deleted" : key;
      moreParams.set(queryKey, String(value));
    }
  if (nextCursor) moreParams.set("cursor", nextCursor);
  return (
    <main>
      <h1>Catalog activity</h1>
      <p>Product and collection activity recorded from immutable catalog snapshots.</p>
      <Form method="get">
        <label>
          Resource type{" "}
          <select name="resourceType" defaultValue={String(filters.resourceType ?? "")}>
            <option value="">All</option>
            <option value="PRODUCT">Product</option>
            <option value="COLLECTION">Collection</option>
          </select>
        </label>{" "}
        <label>
          Action{" "}
          <select name="action" defaultValue={String(filters.action ?? "")}>
            <option value="">All</option>
            <option value="CREATED">Created</option>
            <option value="UPDATED">Updated</option>
            <option value="DELETED">Deleted</option>
          </select>
        </label>{" "}
        <label>
          Topic{" "}
          <select name="topic" defaultValue={String(filters.sourceTopic ?? "")}>
            <option value="">All</option>
            {[
              "PRODUCTS_CREATE",
              "PRODUCTS_UPDATE",
              "PRODUCTS_DELETE",
              "COLLECTIONS_CREATE",
              "COLLECTIONS_UPDATE",
              "COLLECTIONS_DELETE",
            ].map((topic) => (
              <option key={topic}>{topic}</option>
            ))}
          </select>
        </label>{" "}
        <label>
          Deletion status{" "}
          <select
            name="deleted"
            defaultValue={filters.isDeleted === undefined ? "" : String(filters.isDeleted)}
          >
            <option value="">All</option>
            <option value="false">Active snapshot</option>
            <option value="true">Deletion tombstone</option>
          </select>
        </label>{" "}
        <button type="submit">Apply filters</button>
      </Form>
      {!entries.length ? (
        <section>
          <h2>No catalog activity yet</h2>
          <p>
            Activity begins with webhooks processed after catalog snapshot deployment; earlier
            webhook evidence is not backfilled.
          </p>
        </section>
      ) : (
        <ol>
          {entries.map((entry) => (
            <li key={entry.id}>
              <strong>
                {ACTION_LABELS[entry.action]}{" "}
                {entry.resourceType === "PRODUCT" ? "product" : "collection"}
              </strong>{" "}
              <Link
                to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}`}
              >
                {entry.resourceId}
              </Link>
              {" — "}
              <time dateTime={effectiveTime(entry).toISOString()}>
                {effectiveTime(entry).toLocaleString()}
              </time>{" "}
              <span>({entry.isDeleted ? "Deletion tombstone" : "Active snapshot"})</span>
            </li>
          ))}
        </ol>
      )}
      {hasNextPage && nextCursor ? (
        <p>
          <Link to={`?${moreParams.toString()}`}>Load more</Link>
        </p>
      ) : null}
    </main>
  );
}

export function CatalogFindingActivityView({
  page,
  search = "",
}: {
  page: CatalogFindingActivityPage;
  search?: string;
}) {
  const moreParams = new URLSearchParams(search);
  moreParams.delete("findingCursor");
  if (page.nextCursor) moreParams.set("findingCursor", page.nextCursor);
  return (
    <section aria-labelledby="finding-activity-heading">
      <h2 id="finding-activity-heading">Recent catalog finding activity</h2>
      <dl>
        <dt>Candidates analyzed</dt>
        <dd>{page.candidateCount}</dd>
        <dt>Comparable updates</dt>
        <dd>{page.comparableCount}</dd>
        <dt>Skipped candidates</dt>
        <dd>{page.skippedCount}</dd>
        <dt>Comparisons with findings</dt>
        <dd>{page.findingBearingCount}</dd>
      </dl>
      {page.candidateCount === 0 ? (
        <p>No catalog activity is available in this window.</p>
      ) : page.entries.length === 0 ? (
        <p>No deterministic findings matched the recent comparable catalog updates.</p>
      ) : (
        <ol>
          {page.entries.map((entry) => (
            <li key={entry.currentSnapshotId}>
              <p>
                <strong>{entry.resourceType === "PRODUCT" ? "Product" : "Collection"}</strong>
                {" — "}
                {entry.resourceId}
                {" — "}
                <time dateTime={entry.currentEffectiveAt.toISOString()}>
                  {entry.currentEffectiveAt.toLocaleString()}
                </time>
              </p>
              <ul>
                {entry.findings.map((finding) => (
                  <li key={finding.code}>
                    {finding.label}
                    {" — "}
                    {finding.evidenceCount} {entry.truncated ? "returned " : ""}evidence{" "}
                    {finding.evidenceCount === 1 ? "signal" : "signals"}
                  </li>
                ))}
              </ul>
              {entry.truncated ? (
                <p>Comparison truncated; findings and returned evidence may be incomplete.</p>
              ) : null}
              <p>
                <Link
                  to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}?snapshot=${encodeURIComponent(entry.currentSnapshotId)}`}
                >
                  View comparison
                </Link>
              </p>
            </li>
          ))}
        </ol>
      )}
      {page.hasNextPage && page.nextCursor ? (
        <p>
          <Link to={`?${moreParams.toString()}`}>More finding activity</Link>
        </p>
      ) : null}
    </section>
  );
}

export default function CatalogTimelineRoute() {
  const {page, filters, findingActivity, search} = useLoaderData<typeof loader>();
  const entries = page.entries.map((entry) => ({
    ...entry,
    occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : null,
    receivedAt: new Date(entry.receivedAt),
    createdAt: new Date(entry.createdAt),
  }));
  const activity = {
    ...findingActivity,
    entries: findingActivity.entries.map((entry) => ({
      ...entry,
      currentEffectiveAt: new Date(entry.currentEffectiveAt),
    })),
  };
  return (
    <>
      <CatalogTimelineView {...page} entries={entries} filters={filters} />
      <CatalogFindingActivityView page={activity} search={search} />
    </>
  );
}
