import type {LoaderFunctionArgs} from "react-router";
import {Form, useLoaderData} from "react-router";
import {authenticate} from "../shopify.server";
import {queryCatalogDiagnostics} from "../services/catalog-monitor.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  const {session} = await authenticate.admin(request);
  const url = new URL(request.url);
  const filters = {resourceType: url.searchParams.get("resourceType"), topic: url.searchParams.get("topic")};
  return {events: await queryCatalogDiagnostics(session.shop, filters), filters};
};

export default function Diagnostics() {
  const {events, filters} = useLoaderData<typeof loader>();

  return (
    <main>
      <h1>Internal catalog diagnostics</h1>
      <p>This operational view is internal and is not a merchant-facing product timeline.</p>
      <Form method="get">
        <label>
          Resource type
          <select name="resourceType" defaultValue={filters.resourceType ?? ""}>
            <option value="">All</option><option value="PRODUCT">Product</option><option value="COLLECTION">Collection</option>
          </select>
        </label>
        <label>
          Topic
          <select name="topic" defaultValue={filters.topic ?? ""}>
            <option value="">All</option>
            <option value="PRODUCTS_CREATE">Products create</option><option value="PRODUCTS_UPDATE">Products update</option>
            <option value="PRODUCTS_DELETE">Products delete</option><option value="COLLECTIONS_CREATE">Collections create</option>
            <option value="COLLECTIONS_UPDATE">Collections update</option><option value="COLLECTIONS_DELETE">Collections delete</option>
          </select>
        </label>
        <button type="submit">Filter</button>
      </Form>
      <table>
        <thead>
          <tr><th>Received</th><th>Resource type</th><th>Topic</th><th>Shop</th><th>Resource ID</th><th>State</th><th>Payload hash</th></tr>
        </thead>
        <tbody>
          {events.map((event) => (
            <tr key={event.id}>
              <td>{event.receivedAt.toISOString()}</td><td>{event.resourceType}</td><td>{event.topic}</td>
              <td>{event.shop}</td><td>{event.resourceId ?? "—"}</td><td>{event.state}</td><td><code>{event.payloadHash}</code></td>
            </tr>
          ))}
        </tbody>
      </table>
    </main>
  );
}
