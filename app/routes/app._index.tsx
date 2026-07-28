import type {LoaderFunctionArgs} from "react-router";
import {Link, useLoaderData} from "react-router";
import {Badge, Button, Page, Text} from "@shopify/polaris";
import {authenticate} from "../shopify.server";
import {queryCatalogFindingActivity, type CatalogFindingActivityPage} from "../services/catalog-finding-activity.server";
import {queryCatalogTimeline, type CatalogTimelineEntry} from "../services/catalog-timeline.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const [activity, findings] = await Promise.all([
    queryCatalogTimeline(session.shop, {limit: 5}),
    queryCatalogFindingActivity(session.shop),
  ]);
  return {activity, findings};
};

const resourceLabel = (entry: CatalogTimelineEntry) =>
  entry.resourceType === "PRODUCT" ? "Product" : "Collection";
const actionLabel = (entry: CatalogTimelineEntry) =>
  `${resourceLabel(entry)} ${entry.action.toLowerCase()}`;
const effectiveTime = (entry: CatalogTimelineEntry) => entry.occurredAt ?? entry.receivedAt;

export function CatalogOverview({entries, findings}: {
  entries: CatalogTimelineEntry[];
  findings: CatalogFindingActivityPage;
}) {
  const resources = new Set(entries.map((entry) => `${entry.resourceType}:${entry.resourceId}`)).size;
  const lastActivity = entries[0] ? effectiveTime(entries[0]) : undefined;
  const status = !entries.length ? "Waiting for catalog activity"
    : findings.findingBearingCount ? "Findings detected" : "Catalog activity recorded";
  return <Page title="Overview" subtitle="Recent catalog changes and anything that may deserve a closer look.">
    <main className="SkuardMerchant SkuardOverview">
      <section className={`SkuardStatus ${findings.findingBearingCount ? "SkuardStatus--attention" : ""}`} aria-labelledby="monitoring-status">
          {!entries.length ? <div className="SkuardCatalogMark" aria-hidden="true"><span /><span /><span /></div> : null}
          <div className="SkuardStatus__heading"><div><p className="SkuardEyebrow">Catalog monitoring</p><Text as="h2" variant="headingXl" id="monitoring-status">{status}</Text></div>
            <Badge tone={!entries.length ? "attention" : findings.findingBearingCount ? "warning" : "info"}>
              {!entries.length ? "Waiting" : "Monitoring"}
            </Badge></div>
          <Text as="p" tone="subdued">{!entries.length
            ? "Skuard is ready to record product and collection changes made after monitoring was enabled. Previous activity is not backfilled, and no action is required while you wait."
            : `Skuard is receiving catalog changes.${lastActivity ? ` Last activity was recorded ${lastActivity.toLocaleString()}.` : ""}`}</Text>
          {entries.length ? <div className="SkuardStatus__answers">
            <p><span>Latest recorded activity</span><strong>{lastActivity?.toLocaleString()}</strong></p>
            <p><span>Inspection</span><strong>{findings.findingBearingCount ? `${findings.findingBearingCount} recent ${findings.findingBearingCount === 1 ? "change" : "changes"} to inspect` : "No findings in recent activity"}</strong></p>
          </div> : null}
          {entries.length ? <dl className="SkuardSummary">
            <div><dt>Recent changes shown</dt><dd>{entries.length}</dd></div>
            <div><dt>Resources represented</dt><dd>{resources}</dd></div>
            <div><dt>Changes with findings</dt><dd>{findings.findingBearingCount}</dd></div>
          </dl> : null}
          {entries.length ? <Text as="p" tone="subdued">Summary values reflect only the recent activity reviewed here.</Text> : null}
      </section>

      {entries.length ? <div className="SkuardOverview__columns">
        <section className="SkuardActivitySurface" aria-labelledby="recent-activity"><header className="SkuardSectionHeader"><div><p className="SkuardEyebrow">Recorded in Shopify</p><Text as="h2" variant="headingLg" id="recent-activity">Recent activity</Text></div>
            <Button url="/app/catalog" variant="plain">View all activity</Button></header>
          {!entries.length ? <Text as="p" tone="subdued">New product and collection changes will appear here.</Text> :
            <ol className="SkuardActivityList">{entries.map((entry) => <li key={entry.id}>
              <Link className="SkuardActivityRow" to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}`}>
                <span><strong>{actionLabel(entry)}</strong><small>{resourceLabel(entry)} · {entry.resourceId}</small></span>
                <span className="SkuardActivityRow__meta">{entry.isDeleted ? <Badge tone="critical">Deleted</Badge> : null}<time dateTime={effectiveTime(entry).toISOString()}>{effectiveTime(entry).toLocaleString()}</time><span aria-hidden="true">›</span></span>
              </Link>
            </li>)}</ol>}
        </section>

        <section className={`SkuardPanel SkuardFindings ${findings.entries.length ? "SkuardFindings--present" : ""}`}><Text as="h2" variant="headingLg">Changes to inspect</Text>
          {!entries.length ? <><Text as="h3" variant="headingSm">Waiting for catalog activity</Text>
            <Text as="p" tone="subdued">Findings can be evaluated after catalog changes are recorded.</Text></>
            : findings.entries.length === 0 ? <><Text as="h3" variant="headingSm">No findings in recent activity</Text>
              <Text as="p" tone="subdued">No findings were detected in the recent activity reviewed. Some comparisons need more than one recorded state for the same resource.</Text></>
              : <div className="SkuardFindingList">{findings.entries.slice(0, 5).map((entry) => <article key={entry.currentSnapshotId}>
                <Text as="p" fontWeight="semibold">{entry.resourceType === "PRODUCT" ? "Product" : "Collection"} {entry.resourceId}</Text>
                <Text as="p">{entry.findings.map((finding) => finding.label).join(", ")}</Text>
                <Link to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}?snapshot=${encodeURIComponent(entry.currentSnapshotId)}`}>Inspect changes</Link>
              </article>)}</div>}
        </section>
      </div> : null}
    </main>
  </Page>;
}

export default function AppIndex() {
  const {activity, findings} = useLoaderData<typeof loader>();
  return <CatalogOverview entries={activity.entries.map((entry) => ({...entry,
    occurredAt: entry.occurredAt ? new Date(entry.occurredAt) : null,
    receivedAt: new Date(entry.receivedAt), createdAt: new Date(entry.createdAt)}))}
    findings={{...findings, entries: findings.entries.map((entry) => ({...entry,
      currentEffectiveAt: new Date(entry.currentEffectiveAt)}))}} />;
}
