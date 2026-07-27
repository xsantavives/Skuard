import type {LoaderFunctionArgs} from "react-router";
import {Link, useLoaderData} from "react-router";
import {Badge, BlockStack, Box, Button, Card, Divider, InlineGrid, InlineStack, Page, Text} from "@shopify/polaris";
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
  return <Page title="Catalog overview" subtitle="See recent Shopify catalog changes and anything that may deserve a closer look.">
    <BlockStack gap="500">
      <Card>
        <BlockStack gap="300">
          <InlineStack gap="200" blockAlign="center"><Text as="h2" variant="headingLg">{status}</Text>
            <Badge tone={!entries.length ? "attention" : findings.findingBearingCount ? "warning" : "info"}>
              {!entries.length ? "Waiting" : "Monitoring"}
            </Badge></InlineStack>
          <Text as="p" tone="subdued">{!entries.length
            ? "Skuard is ready to record product and collection changes made after monitoring was enabled. Previous activity is not backfilled, and no action is required while you wait."
            : `Skuard is receiving catalog changes.${lastActivity ? ` Last activity was recorded ${lastActivity.toLocaleString()}.` : ""}`}</Text>
          {entries.length ? <InlineGrid columns={{xs: 1, sm: 3}} gap="400">
            <Box><Text as="p" tone="subdued">Recent changes shown</Text><Text as="p" variant="headingLg">{entries.length}</Text></Box>
            <Box><Text as="p" tone="subdued">Resources represented</Text><Text as="p" variant="headingLg">{resources}</Text></Box>
            <Box><Text as="p" tone="subdued">Changes with findings</Text><Text as="p" variant="headingLg">{findings.findingBearingCount}</Text></Box>
          </InlineGrid> : null}
          <Text as="p" tone="subdued">Summary values reflect only the recent activity reviewed here.</Text>
        </BlockStack>
      </Card>

      <InlineGrid columns={{xs: 1, md: 2}} gap="500">
        <Card><BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center"><Text as="h2" variant="headingMd">Recent activity</Text>
            <Button url="/app/catalog" variant="plain">View all activity</Button></InlineStack>
          {!entries.length ? <Text as="p" tone="subdued">New product and collection changes will appear here.</Text> :
            <BlockStack gap="300">{entries.map((entry, index) => <BlockStack key={entry.id} gap="200">
              {index ? <Divider /> : null}
              <InlineStack align="space-between" gap="300" wrap={false}><BlockStack gap="100">
                <Text as="p" fontWeight="semibold">{actionLabel(entry)}</Text>
                <Link to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}`}>{entry.resourceId}</Link>
                {entry.isDeleted ? <Badge tone="critical">Deleted</Badge> : null}
              </BlockStack><Text as="span" tone="subdued"><time dateTime={effectiveTime(entry).toISOString()}>{effectiveTime(entry).toLocaleString()}</time></Text></InlineStack>
            </BlockStack>)}</BlockStack>}
        </BlockStack></Card>

        <Card><BlockStack gap="300">
          <Text as="h2" variant="headingMd">Changes to inspect</Text>
          {!entries.length ? <><Text as="h3" variant="headingSm">Waiting for catalog activity</Text>
            <Text as="p" tone="subdued">Findings can be evaluated after catalog changes are recorded.</Text></>
            : findings.entries.length === 0 ? <><Text as="h3" variant="headingSm">No findings in recent activity</Text>
              <Text as="p" tone="subdued">No findings were detected in the recent activity reviewed. Some comparisons need more than one recorded state for the same resource.</Text></>
              : <BlockStack gap="300">{findings.entries.slice(0, 5).map((entry) => <Box key={entry.currentSnapshotId}>
                <Text as="p" fontWeight="semibold">{entry.resourceType === "PRODUCT" ? "Product" : "Collection"} {entry.resourceId}</Text>
                <Text as="p">{entry.findings.map((finding) => finding.label).join(", ")}</Text>
                <Link to={`/app/catalog/${entry.resourceType}/${encodeURIComponent(entry.resourceId)}?snapshot=${encodeURIComponent(entry.currentSnapshotId)}`}>Inspect changes</Link>
              </Box>)}</BlockStack>}
        </BlockStack></Card>
      </InlineGrid>
    </BlockStack>
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
