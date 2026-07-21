import type {LoaderFunctionArgs} from "react-router";
import {useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {queryCatalogDiagnostics} from "../services/catalog-monitor.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  return {events: await queryCatalogDiagnostics(session.shop)};
};

export default function Diagnostics() {
  const {events} = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>Internal catalog diagnostics</h1>
      <p>This operational view is internal and is not a merchant-facing product timeline.</p>
      <table>
        <thead>
          <tr><th>Received</th><th>Topic</th><th>Resource</th><th>State</th><th>Payload hash</th></tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.receivedAt.toISOString()}</td><td>{event.topic}</td>
              <td>{event.productResourceId ?? "—"}</td><td>{event.state}</td><td><code>{event.payloadHash}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
