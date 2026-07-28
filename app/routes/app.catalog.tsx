import type {LoaderFunctionArgs} from "react-router";
import {Form, Link, useLoaderData} from "react-router";
import {BlockStack, Button, Page, Text} from "@shopify/polaris";
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
const dayLabel = (date: Date) => {
  const today = new Date();
  const calendarDay = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const difference = Math.round((calendarDay(today) - calendarDay(date)) / 86_400_000);
  if (difference === 0) return "Today";
  if (difference === 1) return "Yesterday";
  return date.toLocaleDateString(undefined, {month: "long", day: "numeric", year: date.getFullYear() === today.getFullYear() ? undefined : "numeric"});
};

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
  standalone = true,
}: {
  entries: CatalogTimelineEntry[];
  hasNextPage: boolean;
  nextCursor?: string;
  filters?: CatalogTimelineFilters;
  search?: string;
  standalone?: boolean;
}) {
  const moreParams = paginationParams(search, "cursor");
  for (const [key, value] of Object.entries(filters))
    if (value !== undefined) {
      const queryKey = key === "sourceTopic" ? "topic" : key === "isDeleted" ? "deleted" : key;
      moreParams.set(queryKey, String(value));
    }
  if (nextCursor) moreParams.set("cursor", nextCursor);
  const filtered = Object.values(filters).some((value) => value !== undefined);
  const activeFilterCount = Object.values(filters).filter((value) => value !== undefined).length;
  const content = (
      <div className="SkuardMerchant SkuardCatalog"><BlockStack gap="500">
      <section className="SkuardTimeline" aria-labelledby="activity-heading">
      <header className="SkuardWorkspaceHeader"><div><p className="SkuardEyebrow">Recorded catalog history</p><Text as="h2" variant="headingLg" id="activity-heading">Activity stream</Text></div>
        {entries[0] ? <p>Latest on this page<br /><strong>{effectiveTime(entries[0]).toLocaleString()}</strong></p> : null}</header>
      {!entries.length ? (
        <div className="SkuardPanel"><BlockStack gap="200">
          <Text as="h3" variant="headingMd">{filtered ? "No activity matches these filters" : "Waiting for catalog activity"}</Text>
          <Text as="p" tone="subdued">{filtered
            ? "Try changing or clearing the filters to see other recorded activity."
            : "Skuard records product and collection changes after monitoring was enabled. Previous activity is not backfilled, and no action is required while you wait."}</Text>
          {filtered ? <Button url="/app/catalog">Reset filters</Button> : null}
        </BlockStack></div>
      ) : (
        <ol className="SkuardTimelineList">
          {entries.map((entry, index) => {
            const time = effectiveTime(entry); const group = dayLabel(time);
            const previousGroup = index ? dayLabel(effectiveTime(entries[index - 1])) : undefined;
            return <li key={entry.id}>{group !== previousGroup ? <h3 className="SkuardTimelineList__day">{group}</h3> : null}
              <Link className="SkuardTimelineRow" to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}`}>
                <span className={`SkuardTimelineRow__action SkuardTimelineRow__action--${entry.action.toLowerCase()}`} aria-hidden="true">{ACTION_LABELS[entry.action].slice(0, 1)}</span>
                <span className="SkuardTimelineRow__body"><strong>{entry.resourceType === "PRODUCT" ? "Product" : "Collection"} {ACTION_LABELS[entry.action].toLowerCase()}</strong><small>{entry.resourceId}</small></span>
                <span className="SkuardTimelineRow__meta">{entry.isDeleted ? <span className="SkuardDeleted">Deleted</span> : null}<time dateTime={time.toISOString()}>{time.toLocaleTimeString([], {hour: "numeric", minute: "2-digit"})}<span className="SkuardVisuallyHidden"> on {time.toLocaleDateString()}</span></time><span aria-hidden="true">›</span></span>
              </Link>
            </li>;
          })}
        </ol>
      )}
      {hasNextPage && nextCursor ? <footer className="SkuardPagination"><span>Showing the latest bounded page</span><Button url={`?${moreParams.toString()}`}>Load more activity</Button></footer> : null}
      </section>
      <details className="SkuardFilterBar" open={filtered || undefined}><summary><span>Filter activity</span><span>{activeFilterCount ? `${activeFilterCount} active` : "All activity"}<span aria-hidden="true">⌄</span></span></summary>
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
            <option value="false">Current activity</option>
            <option value="true">Deleted</option>
          </select>
        </label>{" "}
        <div className="SkuardFilterBar__actions"><button type="submit">Apply filters</button>{filtered ? <Link to="/app/catalog">Reset</Link> : null}</div>
      </Form></details>
      </BlockStack></div>
  );
  return standalone ? <Page title="Catalog activity"
    subtitle="Review recent product and collection changes recorded from Shopify.">{content}</Page> : content;
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
      <h2 id="finding-activity-heading">Recent findings</h2>
      {page.candidateCount === 0 ? (
        <p>Findings will appear after catalog activity is recorded.</p>
      ) : page.entries.length === 0 ? (
        <><h3>No findings in recent activity</h3><p>No findings were detected in the recent activity reviewed. Comparison requires more than one recorded state for the same resource.</p></>
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
    <h2 id="detection-overview-heading">Changes to inspect</h2>
    <p>Findings are calculated from recent recorded changes. Older activity may not be included.</p>
    <Form method="get">
      {[...retained.entries()].map(([name, value], index) =>
        <input key={`${name}:${index}`} type="hidden" name={name} value={value} />)}
      <label>Resource type{" "}<select name="resourceType" defaultValue={filters.resourceType ?? ""}>
        <option value="">All</option><option value="PRODUCT">Product</option><option value="COLLECTION">Collection</option>
      </select></label>{" "}
      <label>Finding{" "}<select name="findingCode" defaultValue={filters.findingCode ?? ""}>
        <option value="">All findings</option>
        {CATALOG_COMPARISON_FINDING_CODES.map((code) => <option key={code} value={code}>{code.replaceAll("_", " ").toLowerCase()}</option>)}
      </select></label>{" "}<button type="submit">Apply overview filters</button>
    </Form>
    {(filters.resourceType || filters.findingCode) ? <p>Active overview filters: {[
      filters.resourceType, filters.findingCode,
    ].filter(Boolean).join(" · ")}</p> : <p>Active overview filters: none</p>}
    {page.groups.length === 0 ? <><h3>No findings in recent activity</h3><p>No findings were detected in the recent activity reviewed. Some comparisons need another recorded state for the same resource.</p></> :
      page.groups.map((group) => <article key={group.code}>
        <h3>{group.label}</h3>
        <p>Seen in {group.comparisonCount} recent {group.comparisonCount === 1 ? "change" : "changes"} across {group.distinctResourceCount} {group.distinctResourceCount === 1 ? "resource" : "resources"}.</p>
        <p>Most recently detected: <time dateTime={group.latestOccurrence.effectiveAt.toISOString()}>{group.latestOccurrence.effectiveAt.toLocaleString()}</time></p>
        {group.structurallyTruncatedComparisonCount ? <p>Some contributing changes reached the review limit, so these findings may be incomplete.</p> : null}
        <ul>{group.occurrences.map((occurrence) => <li key={occurrence.currentSnapshotId}>
          <Link to={`/app/catalog/${encodeURIComponent(occurrence.resourceType)}/${encodeURIComponent(occurrence.resourceId)}?snapshot=${encodeURIComponent(occurrence.currentSnapshotId)}`}>
            {occurrence.resourceType === "PRODUCT" ? "Product" : "Collection"} {occurrence.resourceId} — <time dateTime={occurrence.effectiveAt.toISOString()}>{occurrence.effectiveAt.toLocaleString()}</time>
          </Link>{occurrence.structurallyTruncated ? " — Review may be incomplete" : ""}
        </li>)}</ul>
        {group.occurrencesTruncated ? <p>Additional recent occurrences are not shown.</p> : null}
      </article>)}
    {page.hasNextPage ? <p>Older recorded changes are not included on this page, so this is not a catalog-wide total.</p> : null}
    {page.hasNextPage && page.nextCursor ? <p><Link to={`?${moreParams.toString()}`}>Review older changes</Link></p> : null}
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
    <Page title="Catalog activity" subtitle="Review recent product and collection changes recorded from Shopify.">
      <div className="SkuardMerchant SkuardCatalog"><BlockStack gap="500">
        <CatalogTimelineView {...page} entries={entries} filters={filters} search={search} standalone={false} />
        <div className="SkuardInspectionWorkspace"><div className="SkuardInspectionWorkspace__primary"><CatalogFindingActivityView page={activity} search={search} /></div>
        <aside className="SkuardInspectionWorkspace__summary" aria-label="Finding summary"><CatalogDetectionOverviewView page={overview} filters={overviewFilters} search={search} /></aside></div>
      </BlockStack></div>
    </Page>
  );
}
