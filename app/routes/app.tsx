import type {HeadersFunction, LinksFunction, LoaderFunctionArgs} from "react-router";
import {Outlet, useLoaderData, useRouteError} from "react-router";
import {AppProvider as ShopifyAppProvider} from "@shopify/shopify-app-react-router/react";
import {AppProvider as PolarisAppProvider} from "@shopify/polaris";
import enTranslations from "@shopify/polaris/locales/en.json";
import {NavMenu} from "@shopify/app-bridge-react";
import {boundary} from "@shopify/shopify-app-react-router/server";
import {authenticate} from "../shopify.server";
import merchantStyles from "../styles/merchant.css?url";

export const links: LinksFunction = () => [{rel: "stylesheet", href: merchantStyles}];

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

export const merchantNavigation = [
  {label: "Overview", href: "/app", home: true},
  {label: "Catalog activity", href: "/app/catalog", home: false},
] as const;

export default function EmbeddedApp() {
  const {apiKey} = useLoaderData<typeof loader>();

  return (
    <ShopifyAppProvider embedded apiKey={apiKey}>
      <PolarisAppProvider i18n={enTranslations}>
        <NavMenu>
          {merchantNavigation.map((item) => <a key={item.href} href={item.href} rel={item.home ? "home" : undefined}>
            {item.label}
          </a>)}
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
