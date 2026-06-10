import type { AdminApiContext } from "@shopify/shopify-app-remix/server";

const SHIPCOD_API_BASE = "https://api.shipcod.delivery";
const SHIPCOD_WEBHOOK_HOST = "api.shipcod.delivery";

// GraphQL fragments and queries
const WEBHOOK_SUBSCRIPTION_FRAGMENT = `
  id
  callbackUrl
  topic
  format
`;

const GET_ORDERS_CREATE_WEBHOOKS = `
  query GetOrdersCreateWebhooks {
    webhookSubscriptions(first: 50, topics: ORDERS_CREATE) {
      nodes {
        ${WEBHOOK_SUBSCRIPTION_FRAGMENT}
      }
    }
  }
`;

const CREATE_WEBHOOK_MUTATION = `
  mutation WebhookSubscriptionCreate(
    $topic: WebhookSubscriptionTopic!
    $webhookSubscription: WebhookSubscriptionInput!
  ) {
    webhookSubscriptionCreate(
      topic: $topic
      webhookSubscription: $webhookSubscription
    ) {
      webhookSubscription {
        ${WEBHOOK_SUBSCRIPTION_FRAGMENT}
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const DELETE_WEBHOOK_MUTATION = `
  mutation WebhookSubscriptionDelete($id: ID!) {
    webhookSubscriptionDelete(id: $id) {
      deletedWebhookSubscriptionId
      userErrors {
        field
        message
      }
    }
  }
`;

export function buildWebhookUrl(keyCode: string, secretCode: string): string {
  const url = new URL(`${SHIPCOD_API_BASE}/api/orders/apicreate`);
  url.searchParams.set("key", keyCode);
  url.searchParams.set("secret", secretCode);
  url.searchParams.set("source", "SHOPIFY");
  return url.toString();
}

/**
 * Finds all existing ShipCOD webhooks for orders/create topic.
 * Matches by checking if the callback URL contains the ShipCOD domain.
 */
export async function findExistingShipCodWebhooks(
  admin: AdminApiContext["admin"]
): Promise<Array<{ id: string; callbackUrl: string }>> {
  const response = await admin.graphql(GET_ORDERS_CREATE_WEBHOOKS);
  const data = await response.json();

  const nodes = data?.data?.webhookSubscriptions?.nodes ?? [];
  return nodes.filter((node: { id: string; callbackUrl: string }) =>
    node.callbackUrl.includes(SHIPCOD_WEBHOOK_HOST)
  );
}

/**
 * Deletes a webhook by its GID.
 */
export async function deleteWebhook(
  admin: AdminApiContext["admin"],
  webhookId: string
): Promise<void> {
  const response = await admin.graphql(DELETE_WEBHOOK_MUTATION, {
    variables: { id: webhookId },
  });
  const data = await response.json();
  const errors = data?.data?.webhookSubscriptionDelete?.userErrors ?? [];
  if (errors.length > 0) {
    const messages = errors.map((e: { message: string }) => e.message).join(", ");
    throw new Error(`Failed to delete webhook: ${messages}`);
  }
}

/**
 * Creates the ShipCOD orders/create webhook.
 * Returns the new webhook GID.
 */
export async function createShipCodWebhook(
  admin: AdminApiContext["admin"],
  keyCode: string,
  secretCode: string
): Promise<string> {
  const callbackUrl = buildWebhookUrl(keyCode, secretCode);

  const response = await admin.graphql(CREATE_WEBHOOK_MUTATION, {
    variables: {
      topic: "ORDERS_CREATE",
      webhookSubscription: {
        callbackUrl,
        format: "JSON",
      },
    },
  });

  const data = await response.json();
  const result = data?.data?.webhookSubscriptionCreate;

  if (!result) {
    throw new Error("No response from Shopify webhook creation API");
  }

  const userErrors = result.userErrors ?? [];
  if (userErrors.length > 0) {
    const messages = userErrors
      .map((e: { field: string; message: string }) => `${e.field}: ${e.message}`)
      .join(", ");
    throw new Error(`Shopify webhook creation failed: ${messages}`);
  }

  const webhookId = result.webhookSubscription?.id;
  if (!webhookId) {
    throw new Error("Webhook was not created — no ID returned from Shopify");
  }

  return webhookId;
}

/**
 * Full connect flow:
 * 1. Delete all existing ShipCOD webhooks for this shop
 * 2. Create a new webhook with the provided credentials
 * Returns the new webhook GID.
 */
export async function connectShipCodWebhook(
  admin: AdminApiContext["admin"],
  keyCode: string,
  secretCode: string
): Promise<string> {
  // Remove any stale ShipCOD webhooks first
  const existing = await findExistingShipCodWebhooks(admin);
  for (const webhook of existing) {
    await deleteWebhook(admin, webhook.id);
  }

  // Create fresh webhook
  const webhookId = await createShipCodWebhook(admin, keyCode, secretCode);
  return webhookId;
}

/**
 * Full disconnect flow:
 * Deletes all ShipCOD webhooks for this shop.
 */
export async function disconnectShipCodWebhook(
  admin: AdminApiContext["admin"],
  webhookId: string | null
): Promise<void> {
  if (webhookId) {
    // Try to delete by stored ID first
    try {
      await deleteWebhook(admin, webhookId);
      return;
    } catch {
      // Webhook may have been manually deleted; fall through to scan
    }
  }

  // Fallback: scan and delete all ShipCOD webhooks
  const existing = await findExistingShipCodWebhooks(admin);
  for (const webhook of existing) {
    await deleteWebhook(admin, webhook.id);
  }
}
