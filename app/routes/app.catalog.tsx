import type {LoaderFunctionArgs} from "react-router";
import {Form, Link, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {
  parseCatalogDetectionOverviewFilters,
  queryCatalogDetectionOverview,
  type CatalogDetectionOverviewFilters,
  type CatalogDetectionOverviewPage,
} from "../services/catalog-detection-overview.server";
import {CATALOG_COMPARISON_FINDING_CODES} from "../services/catalog-comparison-findings";
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
  const overviewFilters = parseCatalogDetectionOverviewFilters(url.searchParams);
  const [page, findingActivity, detectionOverview] = await Promise.all([
    queryCatalogTimeline(session.shop, {cursor: url.searchParams.get("cursor"), filters}),
    queryCatalogFindingActivity(session.shop, {cursor: url.searchParams.get("findingCursor")}),
    queryCatalogDetectionOverview(session.shop, {
      cursor: url.searchParams.getAll("overviewCursor").length === 1
        ? url.searchParams.get("overviewCursor") : undefined,
      filters: overviewFilters,
    }),
  ]);
  return {page, filters, findingActivity, detectionOverview, overviewFilters, search: url.search};
};

const ACTION_LABELS: Record<CatalogTimelineAction, string> = {
  CREATED: "Created",
  UPDATED: "Updated",
  DELETED: "Deleted",
};

const effectiveTime = (entry: CatalogTimelineEntry) => entry.occurredAt ?? entry.receivedAt;

const paginationParams = (search: string, target: "cursor" | "findingCursor" | "overviewCursor",
  replacement?: string) => {
  const params = new URLSearchParams(search);
  for (const name of ["cursor", "findingCursor", "overviewCursor"] as const) {
    const values = params.getAll(name);
    if (name === target || values.length > 1) params.delete(name);
  }
  if (replacement) params.set(target, replacement);
  return params;
};

export function CatalogTimelineView({
  entries,
  hasNextPage,
  nextCursor,
  filters = {},
  search = "",
}: {
  entries: CatalogTimelineEntry[];
  hasNextPage: boolean;
  nextCursor?: string;
  filters?: CatalogTimelineFilters;
  search?: string;
}) {
  const moreParams = paginationParams(search, "cursor");
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
  const moreParams = paginationParams(search, "findingCursor", page.nextCursor);
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

export function CatalogDetectionOverviewView({page, filters = {}, search = ""}: {
  page: CatalogDetectionOverviewPage; filters?: CatalogDetectionOverviewFilters; search?: string;
}) {
  const moreParams = paginationParams(search, "overviewCursor", page.nextCursor);
  const retained = new URLSearchParams(search);
  for (const name of ["overviewCursor", "resourceType", "findingCode"]) retained.delete(name);
  return <section aria-labelledby="detection-overview-heading">
    <h2 id="detection-overview-heading">Catalog detection overview</h2>
    <p>Showing deterministic findings calculated on demand from the bounded recent candidate window.</p>
    <Form method="get">
      {[...retained.entries()].map(([name, value], index) =>
        <input key={`${name}:${index}`} type="hidden" name={name} value={value} />)}
      <label>Resource type{" "}<select name="resourceType" defaultValue={filters.resourceType ?? ""}>
        <option value="">All</option><option value="PRODUCT">Product</option><option value="COLLECTION">Collection</option>
      </select></label>{" "}
      <label>Finding{" "}<select name="findingCode" defaultValue={filters.findingCode ?? ""}>
        <option value="">All deterministic findings</option>
        {CATALOG_COMPARISON_FINDING_CODES.map((code) => <option key={code} value={code}>{code}</option>)}
      </select></label>{" "}<button type="submit">Apply overview filters</button>
    </Form>
    {(filters.resourceType || filters.findingCode) ? <p>Active overview filters: {[
      filters.resourceType, filters.findingCode,
    ].filter(Boolean).join(" · ")}</p> : <p>Active overview filters: none</p>}
    <dl><dt>Candidates analyzed</dt><dd>{page.candidateCount}</dd>
      <dt>Comparable updates</dt><dd>{page.comparableCount}</dd>
      <dt>Skipped candidates</dt><dd>{page.skippedCount}</dd></dl>
    {page.groups.length === 0 ? <p>No deterministic findings matched this bounded candidate window.</p> :
      page.groups.map((group) => <article key={group.code}>
        <h3>{group.label}</h3><p><code>{group.code}</code></p>
        <p>{group.comparisonCount} exact {group.comparisonCount === 1 ? "comparison" : "comparisons"} · {group.distinctResourceCount} distinct {group.distinctResourceCount === 1 ? "resource" : "resources"} · {group.returnedEvidenceCount} returned evidence {group.returnedEvidenceCount === 1 ? "signal" : "signals"}</p>
        <p>Latest exact occurrence: <time dateTime={group.latestOccurrence.effectiveAt.toISOString()}>{group.latestOccurrence.effectiveAt.toLocaleString()}</time></p>
        <p>{group.structurallyTruncatedComparisonCount} contributing {group.structurallyTruncatedComparisonCount === 1 ? "comparison was" : "comparisons were"} structurally truncated.</p>
        {group.structurallyTruncatedComparisonCount ? <p>Findings are based on returned structural entries; evidence may be incomplete for structurally truncated comparisons.</p> : null}
        <ul>{group.occurrences.map((occurrence) => <li key={occurrence.currentSnapshotId}>
          <Link to={`/app/catalog/${encodeURIComponent(occurrence.resourceType)}/${encodeURIComponent(occurrence.resourceId)}?snapshot=${encodeURIComponent(occurrence.currentSnapshotId)}`}>
            {occurrence.resourceType === "PRODUCT" ? "Product" : "Collection"} {occurrence.resourceId} — <time dateTime={occurrence.effectiveAt.toISOString()}>{occurrence.effectiveAt.toLocaleString()}</time>
          </Link>{" — "}{occurrence.returnedEvidenceCount} returned evidence {occurrence.returnedEvidenceCount === 1 ? "signal" : "signals"}{occurrence.structurallyTruncated ? " — structurally truncated" : ""}
        </li>)}</ul>
        {group.occurrencesTruncated ? <p>Occurrence list truncated; additional contributing comparisons in this candidate window are not shown.</p> : null}
      </article>)}
    {page.hasNextPage ? <p>Older candidate snapshots were not analyzed on this page; this overview is not catalog-wide.</p> : null}
    {page.hasNextPage && page.nextCursor ? <p><Link to={`?${moreParams.toString()}`}>More overview candidates</Link></p> : null}
  </section>;
}

export default function CatalogTimelineRoute() {
  const {page, filters, findingActivity, detectionOverview, overviewFilters, search} = useLoaderData<typeof loader>();
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
  const overview = {...detectionOverview, groups: detectionOverview.groups.map((group) => ({...group,
    latestOccurrence: {...group.latestOccurrence, effectiveAt: new Date(group.latestOccurrence.effectiveAt)},
    occurrences: group.occurrences.map((occurrence) => ({...occurrence, effectiveAt: new Date(occurrence.effectiveAt)})),
  }))};
  return (
    <>
      <CatalogTimelineView {...page} entries={entries} filters={filters} search={search} />
      <CatalogFindingActivityView page={activity} search={search} />
      <CatalogDetectionOverviewView page={overview} filters={overviewFilters} search={search} />
    </>
  );
}
