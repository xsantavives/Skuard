import type {ActionFunctionArgs} from "react-router";
import {authenticate} from "../shopify.server";
import {CATALOG_TOPICS, ingestCatalogWebhook, type JsonValue} from "./catalog-monitor.server";

type AuthenticateWebhook = (request: Request) => Promise<{
  payload: JsonValue;
  shop: string;
  topic: string;
  webhookId: string;
}>;

type IngestWebhook = (input: Parameters<typeof ingestCatalogWebhook>[0]) => Promise<unknown>;

export function createProductWebhookAction(
  authenticateWebhook: AuthenticateWebhook = authenticate.webhook,
  ingest: IngestWebhook = ingestCatalogWebhook,
) {
  return async function handleProductWebhook({request}: ActionFunctionArgs) {
    const {payload, shop, topic, webhookId} = await authenticateWebhook(request);

    if (!CATALOG_TOPICS.includes(topic as (typeof CATALOG_TOPICS)[number])) {
      return new Response("Unsupported webhook topic", {status: 400});
    }

    try {
      await ingest({webhookId, shop, topic, payload});
      return new Response(null, {status: 200});
    } catch (error) {
      console.error(`Failed to persist ${topic} webhook ${webhookId} for ${shop}`, error);
      return new Response("Webhook persistence failed", {status: 500});
    }
  };
}

export const handleProductWebhook = createProductWebhookAction();
