import type {LoaderFunctionArgs} from "react-router";
import {Link, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {renderDiffValue} from "../services/catalog-diff";
import {queryCatalogStructuralDiff, type CatalogStructuralDiff} from "../services/catalog-diff.server";
import {queryCatalogResourceHistory, type CatalogResourceHistory} from "../services/catalog-timeline.server";

export const loader = async ({request, params}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const resourceType = params.resourceType ?? ""; const resourceId = params.resourceId ?? "";
  const history = await queryCatalogResourceHistory(session.shop, resourceType, resourceId);
  if (!history) throw new Response("Catalog resource not found", {status: 404});
  const snapshotId = new URL(request.url).searchParams.get("snapshot");
  const diff = snapshotId ? await queryCatalogStructuralDiff(session.shop, resourceType, resourceId, snapshotId) : undefined;
  if (snapshotId && !diff) throw new Response("Catalog snapshot not found", {status: 404});
  return {history, diff};
};

const labels = {CREATED: "Created", UPDATED: "Updated", DELETED: "Deleted"} as const;
const operations = {ADDED: "Added", REMOVED: "Removed", CHANGED: "Changed"} as const;
const effectiveTime = (entry: CatalogResourceHistory["entries"][number]) => entry.occurredAt ?? entry.receivedAt;
const explanations = {
  NO_PREVIOUS_SNAPSHOT: "No prior snapshot exists, so there is no comparison baseline.",
  CREATED_WITHOUT_BASELINE: "Creation has no active comparison baseline.",
  DELETED_TOMBSTONE: "Deletion is represented by a partial tombstone and is not structurally compared.",
  PREVIOUS_TOMBSTONE: "The previous state is a deletion tombstone, so recreation has no comparable baseline.",
  LIMIT_EXCEEDED: "A safety limit prevented a complete comparison.",
  INVALID_LIFECYCLE: "This snapshot has an unsupported or inconsistent lifecycle and cannot be compared safely.",
} as const;

export function CatalogDiffView({diff}: {diff: CatalogStructuralDiff}) {
  const comparable = diff.status === "COMPARABLE" || diff.status === "LIMIT_EXCEEDED";
  return <section aria-labelledby="changes-heading">
    <h2 id="changes-heading">Structural changes</h2>
    <p><strong>Action:</strong> {labels[diff.currentAction]}</p>
    <p><strong>Current event:</strong> <time dateTime={diff.currentEffectiveAt.toISOString()}>{diff.currentEffectiveAt.toLocaleString()}</time></p>
    {diff.previousEffectiveAt ? <p><strong>Previous event:</strong> <time dateTime={diff.previousEffectiveAt.toISOString()}>{diff.previousEffectiveAt.toLocaleString()}</time></p> : null}
    {!comparable ? <p>{explanations[diff.status as keyof typeof explanations]}</p> : <>
      <p><strong>Changed paths returned:</strong> {diff.returnedChangeCount}</p>
      {diff.truncated ? <p role="alert">{explanations.LIMIT_EXCEEDED} Results are truncated.</p> : null}
      {!diff.entries.length ? <p>No structural changes were found.</p> : <table>
        <thead><tr><th>Path</th><th>Operation</th><th>Before</th><th>After</th></tr></thead>
        <tbody>{diff.entries.map((entry) => {
          const before = renderDiffValue(entry.before, Object.prototype.hasOwnProperty.call(entry, "before"));
          const after = renderDiffValue(entry.after, Object.prototype.hasOwnProperty.call(entry, "after"));
          return <tr key={`${entry.operation}:${entry.path}`}><td><code>{entry.path || "(root)"}</code></td>
            <td>{operations[entry.operation]}</td><td><code data-value-kind={before.kind}>{before.text}</code></td>
            <td><code data-value-kind={after.kind}>{after.text}</code></td></tr>;
        })}</tbody>
      </table>}
    </>}
  </section>;
}

export function CatalogResourceHistoryView({history, diff}: {history: CatalogResourceHistory; diff?: CatalogStructuralDiff}) {
  return <main>
    <p><Link to="/app/catalog">← Back to catalog activity</Link></p>
    <h1>{history.resourceType === "PRODUCT" ? "Product" : "Collection"} history</h1>
    <p><strong>Resource ID:</strong> {history.resourceId}</p>
    <p><strong>Current status:</strong> {history.status === "ACTIVE" ? "Active" : "Deleted"}</p>
    {diff ? <CatalogDiffView diff={diff} /> : null}
    <h2>Event history</h2>
    <ol>{history.entries.map((entry) => <li key={entry.id}>
      <strong>{labels[entry.action]}</strong>{" — "}
      <time dateTime={effectiveTime(entry).toISOString()}>{effectiveTime(entry).toLocaleString()}</time>
      {entry.isDeleted ? " (Deletion tombstone)" : ""}{" "}
      <Link to={`?snapshot=${encodeURIComponent(entry.id)}`}>View changes</Link>
    </li>)}</ol>
  </main>;
}

export default function CatalogResourceHistoryRoute() {
  const {history, diff} = useLoaderData<typeof loader>();
  const hydratedHistory = {...history, entries: history.entries.map((entry) => ({...entry,
    occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : null, receivedAt: new Date(entry.receivedAt),
    createdAt: new Date(entry.createdAt)}))};
  const hydratedDiff = diff ? {...diff, currentEffectiveAt: new Date(diff.currentEffectiveAt),
    previousEffectiveAt: diff.previousEffectiveAt ? new Date(diff.previousEffectiveAt) : undefined} : undefined;
  return <CatalogResourceHistoryView history={hydratedHistory} diff={hydratedDiff} />;
}
