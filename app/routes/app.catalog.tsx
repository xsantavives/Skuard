import type {LoaderFunctionArgs} from "react-router";
import {Form, Link, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {parseTimelineFilters, queryCatalogTimeline,
  type CatalogTimelineAction, type CatalogTimelineEntry} from "../services/catalog-timeline.server";
import type {CatalogTimelineFilters} from "../services/catalog-timeline.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = parseTimelineFilters(url.searchParams);
  const page = await queryCatalogTimeline(session.shop, {cursor: url.searchParams.get("cursor"), filters});
  return {page, filters};
};

const ACTION_LABELS: Record<CatalogTimelineAction, string> = {
  CREATED: "Created", UPDATED: "Updated", DELETED: "Deleted",
};

const effectiveTime = (entry: CatalogTimelineEntry) => entry.occurredAt ?? entry.receivedAt;

export function CatalogTimelineView({entries, hasNextPage, nextCursor, filters = {}}: {
  entries: CatalogTimelineEntry[]; hasNextPage: boolean; nextCursor?: string;
  filters?: CatalogTimelineFilters;
}) {
  const moreParams = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value !== undefined) {
    const queryKey = key === "sourceTopic" ? "topic" : key === "isDeleted" ? "deleted" : key;
    moreParams.set(queryKey, String(value));
  }
  if (nextCursor) moreParams.set("cursor", nextCursor);
  return <main>
    <h1>Catalog activity</h1>
    <p>Product and collection activity recorded from immutable catalog snapshots.</p>
    <Form method="get">
      <label>Resource type <select name="resourceType" defaultValue={String(filters.resourceType ?? "")}>
        <option value="">All</option><option value="PRODUCT">Product</option><option value="COLLECTION">Collection</option>
      </select></label>{" "}
      <label>Action <select name="action" defaultValue={String(filters.action ?? "")}>
        <option value="">All</option><option value="CREATED">Created</option><option value="UPDATED">Updated</option><option value="DELETED">Deleted</option>
      </select></label>{" "}
      <label>Topic <select name="topic" defaultValue={String(filters.sourceTopic ?? "")}>
        <option value="">All</option>
        {['PRODUCTS_CREATE','PRODUCTS_UPDATE','PRODUCTS_DELETE','COLLECTIONS_CREATE','COLLECTIONS_UPDATE','COLLECTIONS_DELETE'].map((topic) => <option key={topic}>{topic}</option>)}
      </select></label>{" "}
      <label>Deletion status <select name="deleted" defaultValue={filters.isDeleted === undefined ? "" : String(filters.isDeleted)}>
        <option value="">All</option><option value="false">Active snapshot</option><option value="true">Deletion tombstone</option>
      </select></label>{" "}<button type="submit">Apply filters</button>
    </Form>
    {!entries.length ? <section><h2>No catalog activity yet</h2><p>Activity begins with webhooks processed after catalog snapshot deployment; earlier webhook evidence is not backfilled.</p></section> :
      <ol>{entries.map((entry) => <li key={entry.id}>
        <strong>{ACTION_LABELS[entry.action]} {entry.resourceType === "PRODUCT" ? "product" : "collection"}</strong>{" "}
        <Link to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}`}>{entry.resourceId}</Link>{" — "}
        <time dateTime={effectiveTime(entry).toISOString()}>{effectiveTime(entry).toLocaleString()}</time>{" "}
        <span>({entry.isDeleted ? "Deletion tombstone" : "Active snapshot"})</span>
      </li>)}</ol>}
    {hasNextPage && nextCursor ? <p><Link to={`?${moreParams.toString()}`}>Load more</Link></p> : null}
  </main>;
}

export default function CatalogTimelineRoute() {
  const {page, filters} = useLoaderData<typeof loader>();
  const entries = page.entries.map((entry) => ({...entry, occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : null,
    receivedAt: new Date(entry.receivedAt), createdAt: new Date(entry.createdAt)}));
  return <CatalogTimelineView {...page} entries={entries} filters={filters} />;
}
