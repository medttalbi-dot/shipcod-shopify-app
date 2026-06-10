import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "~/shopify.server";
import { deleteShopConfig } from "~/models/shopConfig.server";

/**
 * Handles Shopify system webhooks (app/uninstalled, etc.)
 * These are different from the ShipCOD order webhooks we create.
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload } = await authenticate.webhook(request);

  console.log(`[Shopify Webhook] Received: ${topic} for shop: ${shop}`);

  switch (topic) {
    case "APP_UNINSTALLED":
      // Clean up all ShipCOD config when app is uninstalled.
      // The Shopify session is also automatically invalidated.
      await deleteShopConfig(shop);
      console.log(`[Shopify Webhook] Cleaned up config for uninstalled shop: ${shop}`);
      break;

    case "CUSTOMERS_DATA_REQUEST":
    case "CUSTOMERS_REDACT":
      // GDPR webhooks — required for app store listing.
      // We do not store PII beyond the shop domain.
      console.log(`[Shopify Webhook] GDPR ${topic} for shop: ${shop} — no PII stored`);
      break;

    case "SHOP_REDACT":
      await deleteShopConfig(shop);
      console.log(`[Shopify Webhook] GDPR SHOP_REDACT: removed config for ${shop}`);
      break;

    default:
      console.warn(`[Shopify Webhook] Unhandled topic: ${topic}`);
  }

  void payload; // acknowledge receipt
  return new Response(null, { status: 200 });
};
