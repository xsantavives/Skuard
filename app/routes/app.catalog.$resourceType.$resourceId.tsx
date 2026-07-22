import type {LoaderFunctionArgs} from "react-router";
import {Link, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {renderDiffValue} from "../services/catalog-diff-renderer";
import {classifyCatalogDiffEntry, summarizeCatalogChangeClassifications} from "../services/catalog-change-taxonomy";
import {deriveCatalogChangeSignals, summarizeCatalogChangeSignals} from "../services/catalog-change-signals";
import {deriveCatalogComparisonFindings} from "../services/catalog-comparison-findings";
import {queryCatalogStructuralDiff, type CatalogStructuralDiff} from "../services/catalog-diff.server";
import {queryCatalogFindingHistory, type CatalogHistoricalFindingSummary} from "../services/catalog-finding-history.server";
import {queryCatalogResourceHistory, type CatalogResourceHistory} from "../services/catalog-timeline.server";

export const loader = async ({request, params}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const resourceType = params.resourceType ?? ""; const resourceId = params.resourceId ?? "";
  const [history, historicalFindings] = await Promise.all([
    queryCatalogResourceHistory(session.shop, resourceType, resourceId),
    queryCatalogFindingHistory(session.shop, resourceType, resourceId),
  ]);
  if (!history || !historicalFindings) throw new Response("Catalog resource not found", {status: 404});
  const snapshotId = new URL(request.url).searchParams.get("snapshot");
  const diff = snapshotId ? await queryCatalogStructuralDiff(session.shop, resourceType, resourceId, snapshotId) : undefined;
  if (snapshotId && !diff) throw new Response("Catalog snapshot not found", {status: 404});
  return {history, historicalFindings, diff};
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
  const summary = summarizeCatalogChangeClassifications(diff.resourceType, diff.entries);
  const signals = deriveCatalogChangeSignals(diff.resourceType, diff.entries);
  const signalSummary = summarizeCatalogChangeSignals(signals);
  const findings = deriveCatalogComparisonFindings(diff.resourceType, signals, {truncated: diff.truncated});
  const signalLabels = new Map(signals.map((signal) => [signal.code, signal.label]));
  return <section aria-labelledby="changes-heading">
    <h2 id="changes-heading">Structural changes</h2>
    <p><strong>Action:</strong> {labels[diff.currentAction]}</p>
    <p><strong>Current event:</strong> <time dateTime={diff.currentEffectiveAt.toISOString()}>{diff.currentEffectiveAt.toLocaleString()}</time></p>
    {diff.previousEffectiveAt ? <p><strong>Previous event:</strong> <time dateTime={diff.previousEffectiveAt.toISOString()}>{diff.previousEffectiveAt.toLocaleString()}</time></p> : null}
    {!comparable ? <p>{explanations[diff.status as keyof typeof explanations]}</p> : <>
      <p><strong>Changed paths returned:</strong> {diff.returnedChangeCount}</p>
      {summary.length ? <div aria-labelledby="change-summary-heading">
        <h3 id="change-summary-heading">Change categories</h3>
        <ul>{summary.map((item) => <li key={item.category}>{item.label}: {item.count}</li>)}</ul>
      </div> : null}
      {diff.truncated ? <p role="alert">{explanations.LIMIT_EXCEEDED} Results are truncated.</p> : null}
      {!diff.entries.length ? <p>No structural changes were found.</p> : <table>
        <thead><tr><th>Category</th><th>Path</th><th>Operation</th><th>Before</th><th>After</th></tr></thead>
        <tbody>{diff.entries.map((entry) => {
          const classification = classifyCatalogDiffEntry(diff.resourceType, entry);
          const before = renderDiffValue(entry.before, Object.prototype.hasOwnProperty.call(entry, "before"));
          const after = renderDiffValue(entry.after, Object.prototype.hasOwnProperty.call(entry, "after"));
          return <tr key={`${entry.operation}:${entry.path}`}><td>{classification.label}</td><td><code>{entry.path || "(root)"}</code></td>
            <td>{operations[entry.operation]}</td><td><code data-value-kind={before.kind}>{before.text}</code></td>
            <td><code data-value-kind={after.kind}>{after.text}</code></td></tr>;
        })}</tbody>
      </table>}
      <section aria-labelledby="signals-heading">
        <h3 id="signals-heading">Detected signals</h3>
        {diff.truncated ? <p>Signals are based only on the returned structural changes because the comparison was truncated.</p> : null}
        {!signals.length ? <p>No deterministic signals matched the returned structural changes.</p> : <>
          <ul>{signalSummary.map((item) => <li key={item.code}>{item.label}: {item.count}</li>)}</ul>
          <table>
            <thead><tr><th>Signal</th><th>Category</th><th>Path</th><th>Operation</th><th>Before</th><th>After</th></tr></thead>
            <tbody>{signals.map((signal, index) => {
              const before = renderDiffValue(signal.before, Object.prototype.hasOwnProperty.call(signal, "before"));
              const after = renderDiffValue(signal.after, Object.prototype.hasOwnProperty.call(signal, "after"));
              return <tr key={`${signal.operation}:${signal.path}:${index}`}><td>{signal.label}</td>
                <td>{classifyCatalogDiffEntry(diff.resourceType, signal).label}</td><td><code>{signal.path}</code></td>
                <td>{operations[signal.operation]}</td><td><code data-value-kind={before.kind}>{before.text}</code></td>
                <td><code data-value-kind={after.kind}>{after.text}</code></td></tr>;
            })}</tbody>
          </table>
        </>}
      </section>
      <section aria-labelledby="findings-heading">
        <h3 id="findings-heading">Comparison findings</h3>
        {diff.truncated ? <p>Findings are based only on the returned structural changes because the comparison was truncated.</p> : null}
        {!findings.length ? <p>No deterministic comparison findings matched the returned signals.</p> : <table>
          <thead><tr><th>Finding</th><th>Evidence signals</th><th>Evidence count</th></tr></thead>
          <tbody>{findings.map((finding) => <tr key={finding.code}><td>{finding.label}</td>
            <td>{finding.evidenceSignalCodes.map((code) => signalLabels.get(code)).join(", ")}</td><td>{finding.evidenceCount}</td></tr>)}</tbody>
        </table>}
      </section>
    </>}
  </section>;
}

export function HistoricalFindingsView({summary}: {summary: CatalogHistoricalFindingSummary}) {
  const truncated = summary.truncatedComparisonCount;
  return <section aria-labelledby="historical-findings-heading">
    <h2 id="historical-findings-heading">Recent historical findings</h2>
    <p>Historical findings are based on the most recent {summary.requestedComparisonLimit} adjacent comparisons.</p>
    {!summary.historyExhausted ? <p>Older catalog history was not analyzed in this summary.</p> : null}
    <dl>
      <dt>Snapshots considered</dt><dd>{summary.snapshotCount}</dd>
      <dt>Adjacent comparisons examined</dt><dd>{summary.adjacentPairCount}</dd>
      <dt>Comparable updates</dt><dd>{summary.comparablePairCount}</dd>
      <dt>Non-comparable pairs</dt><dd>{summary.skippedPairCount}</dd>
      <dt>Structurally truncated comparisons</dt><dd>{truncated}</dd>
    </dl>
    {truncated > 0 ? <p>{truncated} analyzed {truncated === 1 ? "comparison was" : "comparisons were"} structurally truncated; {truncated === 1 ? "its" : "their"} findings may be incomplete.</p> : null}
    {summary.comparablePairCount === 0 ? <p>No comparable updates were available in the analyzed snapshot window.</p> :
      summary.findings.length === 0 ? <p>No deterministic findings matched the analyzed comparable updates.</p> : <table>
        <thead><tr><th>Finding</th><th>Comparisons observed</th><th>Evidence signals</th></tr></thead>
        <tbody>{summary.findings.map((finding) => <tr key={finding.code}><td>{finding.label}</td>
          <td>{finding.comparisonCount} of {summary.comparablePairCount}</td><td>{finding.evidenceCount}</td></tr>)}</tbody>
      </table>}
  </section>;
}

export function CatalogResourceHistoryView({history, historicalFindings, diff}: {history: CatalogResourceHistory;
  historicalFindings: CatalogHistoricalFindingSummary; diff?: CatalogStructuralDiff}) {
  return <main>
    <p><Link to="/app/catalog">← Back to catalog activity</Link></p>
    <h1>{history.resourceType === "PRODUCT" ? "Product" : "Collection"} history</h1>
    <p><strong>Resource ID:</strong> {history.resourceId}</p>
    <p><strong>Current status:</strong> {history.status === "ACTIVE" ? "Active" : "Deleted"}</p>
    {diff ? <CatalogDiffView diff={diff} /> : null}
    <HistoricalFindingsView summary={historicalFindings} />
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
  const {history, historicalFindings, diff} = useLoaderData<typeof loader>();
  const hydratedHistory = {...history, entries: history.entries.map((entry) => ({...entry,
    occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : null, receivedAt: new Date(entry.receivedAt),
    createdAt: new Date(entry.createdAt)}))};
  const hydratedDiff = diff ? {...diff, currentEffectiveAt: new Date(diff.currentEffectiveAt),
    previousEffectiveAt: diff.previousEffectiveAt ? new Date(diff.previousEffectiveAt) : undefined} : undefined;
  const hydratedFindings = {...historicalFindings, occurrences: historicalFindings.occurrences.map((occurrence) => ({...occurrence,
    currentEffectiveAt: new Date(occurrence.currentEffectiveAt), previousEffectiveAt: new Date(occurrence.previousEffectiveAt)}))};
  return <CatalogResourceHistoryView history={hydratedHistory} historicalFindings={hydratedFindings} diff={hydratedDiff} />;
}
