import type {LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {parseCatalogDiagnosticFilters, queryCatalogDiagnostics} from "../services/catalog-monitor.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const filters = parseCatalogDiagnosticFilters(new URL(request.url).searchParams);
  return {events: await queryCatalogDiagnostics(session.shop, 50, filters)};
};

export default function Diagnostics() {
  const {events} = useLoaderData<typeof loader>();

  return <DiagnosticsView events={events} />;
}

export function DiagnosticsView({events}: {events: Awaited<ReturnType<typeof loader>>["events"]}) {

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
    </main>
  );
}
