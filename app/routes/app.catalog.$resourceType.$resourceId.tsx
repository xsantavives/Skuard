import type {LoaderFunctionArgs} from "react-router";
import {Link, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {queryCatalogResourceHistory, type CatalogResourceHistory} from "../services/catalog-timeline.server";

export const loader = async ({request, params}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const history = await queryCatalogResourceHistory(session.shop, params.resourceType ?? "", params.resourceId ?? "");
  if (!history) throw new Response("Catalog resource not found", {status: 404});
  return {history};
};

const labels = {CREATED: "Created", UPDATED: "Updated", DELETED: "Deleted"} as const;
const effectiveTime = (entry: CatalogResourceHistory["entries"][number]) => entry.occurredAt ?? entry.receivedAt;

export function CatalogResourceHistoryView({history}: {history: CatalogResourceHistory}) {
  return <main>
    <p><Link to="/app/catalog">← Back to catalog activity</Link></p>
    <h1>{history.resourceType === "PRODUCT" ? "Product" : "Collection"} history</h1>
    <p><strong>Resource ID:</strong> {history.resourceId}</p>
    <p><strong>Current status:</strong> {history.status === "ACTIVE" ? "Active" : "Deleted"}</p>
    <h2>Event history</h2>
    <ol>{history.entries.map((entry) => <li key={entry.id}>
      <strong>{labels[entry.action]}</strong>{" — "}
      <time dateTime={effectiveTime(entry).toISOString()}>{effectiveTime(entry).toLocaleString()}</time>
      {entry.isDeleted ? " (Deletion tombstone)" : ""}
    </li>)}</ol>
  </main>;
}

export default function CatalogResourceHistoryRoute() {
  const {history} = useLoaderData<typeof loader>();
  return <CatalogResourceHistoryView history={{...history, entries: history.entries.map((entry) => ({...entry,
    occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : null, receivedAt: new Date(entry.receivedAt),
    createdAt: new Date(entry.createdAt)}))}} />;
}
