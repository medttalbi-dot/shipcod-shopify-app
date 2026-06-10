import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useRouteError,
} from "@remix-run/react";
import type { LoaderFunctionArgs } from "@remix-run/node";
import { boundary } from "@shopify/shopify-app-remix/server";

import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  {
    rel: "stylesheet",
    href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css",
  },
];

export async function loader(_args: LoaderFunctionArgs) {
  return null;
}

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  return boundary.error(error);
}

export const headers = boundary.headers;
