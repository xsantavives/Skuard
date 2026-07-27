import type {HeadersFunction, LoaderFunctionArgs} from "react-router";
import {Outlet, useLoaderData, useRouteError} from "react-router";
import {AppProvider as ShopifyAppProvider} from "@shopify/shopify-app-react-router/react";
import {AppProvider as PolarisAppProvider} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import {NavMenu} from "@shopify/app-bridge-react";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {authenticate} from "../shopify.server";

export const loader = async ({request}: LoaderFunctionArgs) => {
  try {
    await authenticate.admin(request);

    return {
      apiKey: process.env.SHOPIFY_API_KEY ?? "",
    };
  } catch (error) {
    console.error("Embedded app authentication failed", error);
    throw error;
  }
};

export default function EmbeddedApp() {
  const {apiKey} = useLoaderData<typeof loader>();

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <NavMenu>
          <a href="/app" rel="home">
            Home
          </a>
          <a href="/app/catalog">Catalog activity</a>
          <a href="/app/diagnostics">Diagnostics</a>
        </NavMenu>
        <Outlet />
      </PolarisAppProvider>
    </ShopifyAppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) =>
  boundary.headers(headersArgs);
