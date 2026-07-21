import type {LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {parseCatalogDiagnosticFilters, queryCatalogDiagnostics} from "../services/catalog-monitor.server";
import {parseSnapshotDiagnosticFilters, querySnapshotDiagnostics} from "../services/catalog-snapshot.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const filters = parseCatalogDiagnosticFilters(new URL(request.url).searchParams);
  const snapshotFilters = parseSnapshotDiagnosticFilters(new URL(request.url).searchParams);
  const [events, snapshots] = await Promise.all([
    queryCatalogDiagnostics(session.shop, 50, filters), querySnapshotDiagnostics(session.shop, 50, snapshotFilters),
  ]);
  return {events, snapshots};
};

export default function Diagnostics() {
  const {events} = useLoaderData<typeof loader>();

  const {snapshots} = useLoaderData<typeof loader>();
  return <DiagnosticsView events={events} snapshots={snapshots} />;
}

export function DiagnosticsView({events, snapshots = []}: {
  events: Awaited<ReturnType<typeof loader>>["events"];
  snapshots?: Awaited<ReturnType<typeof loader>>["snapshots"];
}) {

  return (
    <main>
      <h1>Internal catalog diagnostics</h1>
      <p>This operational view is internal and is not a merchant-facing product timeline.</p>
      <table>
        <thead>
          <tr><th>Resource type</th><th>Topic</th><th>Shop</th><th>Resource ID</th><th>Received</th><th>Processing state</th><th>Payload hash</th></tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.resourceType}</td><td>{event.topic}</td><td>{event.shop}</td>
              <td>{event.resourceId ?? "—"}</td><td>{event.receivedAt.toISOString()}</td>
              <td>{event.state}</td><td><code>{event.payloadHash}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
      <section>
        <h2>Immutable catalog snapshots</h2>
        <table>
          <thead><tr><th>Resource type</th><th>Resource ID</th><th>Source topic</th><th>Deleted</th><th>Occurred</th><th>Received</th><th>Created</th><th>State hash</th></tr></thead>
          <tbody>{snapshots.map((snapshot) => <tr key={snapshot.id}>
            <td>{snapshot.resourceType}</td><td>{snapshot.resourceId}</td><td>{snapshot.sourceTopic}</td>
            <td>{snapshot.isDeleted ? "yes" : "no"}</td><td>{snapshot.occurredAt?.toISOString() ?? "—"}</td>
            <td>{snapshot.receivedAt.toISOString()}</td><td>{snapshot.createdAt.toISOString()}</td>
            <td><code>{snapshot.stateHash}</code></td>
          </tr>)}</tbody>
        </table>
      </section>
    </main>
  );
}
