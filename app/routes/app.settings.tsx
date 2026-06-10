import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json, redirect } from "@remix-run/node";
import {
  useActionData,
  useLoaderData,
  useNavigation,
  useSubmit,
} from "@remix-run/react";
import {
  Badge,
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  Divider,
  FormLayout,
  InlineStack,
  Modal,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import { authenticate } from "~/shopify.server";
import {
  getShopConfigStatus,
  getShopCredentials,
  disconnectShop,
  saveShopConfig,
} from "~/models/shopConfig.server";
import {
  connectShipCodWebhook,
  disconnectShipCodWebhook,
} from "~/services/webhook.server";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoaderData = {
  shop: string;
  isConnected: boolean;
  maskedKeyCode: string | null;
  maskedSecret: string | null;
  webhookId: string | null;
};

type ActionData =
  | { intent: "disconnect"; success: true }
  | { intent: "disconnect"; success: false; error: string }
  | { intent: "reconnect"; success: true }
  | { intent: "reconnect"; success: false; error: string; fieldErrors?: Record<string, string> };

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getShopConfigStatus(session.shop);

  if (!config) {
    return redirect("/app");
  }

  return json<LoaderData>({
    shop: session.shop,
    isConnected: config.isConnected,
    maskedKeyCode: config.maskedKeyCode,
    maskedSecret: config.maskedSecret,
    webhookId: config.webhookId,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  // ── Disconnect ──────────────────────────────────────────────────────────────
  if (intent === "disconnect") {
    try {
      const credentials = await getShopCredentials(session.shop);
      await disconnectShipCodWebhook(admin, credentials?.webhookId ?? null);
      await disconnectShop(session.shop);
      console.log(`[ShipCOD] Disconnected shop: ${session.shop}`);
      return json<ActionData>({ intent: "disconnect", success: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to disconnect.";
      console.error(`[ShipCOD] Disconnect error for ${session.shop}:`, err);
      return json<ActionData>(
        { intent: "disconnect", success: false, error: message },
        { status: 500 }
      );
    }
  }

  // ── Reconnect / Update credentials ─────────────────────────────────────────
  if (intent === "reconnect") {
    const keyCode = String(formData.get("keyCode") ?? "").trim();
    const secretCode = String(formData.get("secretCode") ?? "").trim();

    const fieldErrors: Record<string, string> = {};
    if (!keyCode) fieldErrors.keyCode = "KEY_CODE is required";
    if (!secretCode) fieldErrors.secretCode = "SECRET_CODE is required";
    if (Object.keys(fieldErrors).length > 0) {
      return json<ActionData>(
        {
          intent: "reconnect",
          success: false,
          error: "Please fill in all fields.",
          fieldErrors,
        },
        { status: 422 }
      );
    }

    try {
      const webhookId = await connectShipCodWebhook(admin, keyCode, secretCode);
      await saveShopConfig({
        shop: session.shop,
        keyCode,
        secretCode,
        webhookId,
      });
      console.log(
        `[ShipCOD] Reconnected shop ${session.shop}, webhook ${webhookId}`
      );
      return json<ActionData>({ intent: "reconnect", success: true });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "An unexpected error occurred.";
      console.error(`[ShipCOD] Reconnect error for ${session.shop}:`, err);
      return json<ActionData>(
        { intent: "reconnect", success: false, error: message },
        { status: 500 }
      );
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [showReconnectForm, setShowReconnectForm] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [newKeyCode, setNewKeyCode] = useState("");
  const [newSecretCode, setNewSecretCode] = useState("");

  // Derive current state — loader data is stale after successful reconnect
  const isConnected =
    actionData?.intent === "disconnect" && actionData.success
      ? false
      : actionData?.intent === "reconnect" && actionData.success
      ? true
      : loaderData.isConnected;

  const isSubmitting = navigation.state === "submitting";
  const isDisconnecting =
    isSubmitting && navigation.formData?.get("intent") === "disconnect";
  const isReconnecting =
    isSubmitting && navigation.formData?.get("intent") === "reconnect";

  const reconnectErrors =
    actionData?.intent === "reconnect" && !actionData.success
      ? actionData.fieldErrors ?? {}
      : {};
  const reconnectError =
    actionData?.intent === "reconnect" && !actionData.success
      ? actionData.error
      : null;
  const disconnectError =
    actionData?.intent === "disconnect" && !actionData.success
      ? actionData.error
      : null;

  const handleDisconnect = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "disconnect");
    submit(formData, { method: "post" });
    setShowDisconnectModal(false);
  }, [submit]);

  const handleReconnect = useCallback(() => {
    const formData = new FormData();
    formData.append("intent", "reconnect");
    formData.append("keyCode", newKeyCode);
    formData.append("secretCode", newSecretCode);
    submit(formData, { method: "post" });
  }, [newKeyCode, newSecretCode, submit]);

  // After a successful reconnect, collapse the form
  const reconnectSuccess =
    actionData?.intent === "reconnect" && actionData.success;

  return (
    <Page
      title="ShipCOD Settings"
      subtitle="Manage your ShipCOD integration"
      backAction={{ content: "Dashboard", url: "/app" }}
    >
      <BlockStack gap="600">
        {/* Disconnect error */}
        {disconnectError && (
          <Banner tone="critical" title="Disconnect failed">
            <Text as="p">{disconnectError}</Text>
          </Banner>
        )}

        {/* Reconnect success */}
        {reconnectSuccess && !showReconnectForm && (
          <Banner tone="success" title="Credentials updated">
            <Text as="p">
              Your ShipCOD webhook has been updated with the new credentials.
            </Text>
          </Banner>
        )}

        {/* Disconnect success */}
        {actionData?.intent === "disconnect" && actionData.success && (
          <Banner
            tone="info"
            title="Disconnected"
            action={{ content: "Reconnect", url: "/app" }}
          >
            <Text as="p">
              Your ShipCOD integration has been removed. New orders will no
              longer sync to ShipCOD.
            </Text>
          </Banner>
        )}

        {/* Connection status card */}
        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">
                Connection Status
              </Text>
              <Badge tone={isConnected ? "success" : "warning"}>
                {isConnected ? "Connected" : "Not connected"}
              </Badge>
            </InlineStack>

            <Divider />

            {/* Store info rows */}
            <BlockStack gap="300">
              <InfoRow label="Store" value={loaderData.shop} />
              <InfoRow
                label="KEY_CODE"
                value={loaderData.maskedKeyCode ?? "—"}
              />
              <InfoRow
                label="SECRET_CODE"
                value={loaderData.maskedSecret ?? "—"}
                isSensitive
              />
              {loaderData.webhookId && (
                <InfoRow
                  label="Webhook ID"
                  value={loaderData.webhookId.split("/").pop() ?? loaderData.webhookId}
                />
              )}
            </BlockStack>

            <Divider />

            {/* Actions */}
            <InlineStack gap="300">
              {isConnected && (
                <>
                  <Button
                    tone="critical"
                    onClick={() => setShowDisconnectModal(true)}
                    disabled={isDisconnecting || isReconnecting}
                  >
                    Disconnect
                  </Button>
                  <Button
                    onClick={() => {
                      setShowReconnectForm((v) => !v);
                      setNewKeyCode("");
                      setNewSecretCode("");
                    }}
                    disabled={isDisconnecting || isReconnecting}
                  >
                    Update Credentials
                  </Button>
                </>
              )}
              {!isConnected && (
                <Button variant="primary" url="/app">
                  Connect ShipCOD
                </Button>
              )}
            </InlineStack>
          </BlockStack>
        </Card>

        {/* Update credentials form */}
        {showReconnectForm && isConnected && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">
                Update Credentials
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                Enter your new credentials. The old Shopify webhook will be
                deleted and a new one created automatically.
              </Text>

              {reconnectError && (
                <Banner tone="critical">
                  <Text as="p">{reconnectError}</Text>
                </Banner>
              )}

              <FormLayout>
                <TextField
                  label="New KEY_CODE"
                  value={newKeyCode}
                  onChange={setNewKeyCode}
                  autoComplete="off"
                  placeholder="Enter new KEY_CODE"
                  error={reconnectErrors.keyCode}
                  disabled={isReconnecting}
                />
                <TextField
                  label="New SECRET_CODE"
                  value={newSecretCode}
                  onChange={setNewSecretCode}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter new SECRET_CODE"
                  error={reconnectErrors.secretCode}
                  helpText="Your secret will be encrypted and the previous one discarded."
                  disabled={isReconnecting}
                />
              </FormLayout>

              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={handleReconnect}
                  loading={isReconnecting}
                  disabled={isReconnecting}
                >
                  {isReconnecting ? "Updating…" : "Update & Reconnect"}
                </Button>
                <Button
                  onClick={() => setShowReconnectForm(false)}
                  disabled={isReconnecting}
                >
                  Cancel
                </Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        {/* About card */}
        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">
              About this integration
            </Text>
            <BlockStack gap="200">
              <InfoRow label="Webhook topic" value="orders/create" />
              <InfoRow label="Webhook format" value="JSON" />
              <InfoRow
                label="Webhook URL"
                value="https://api.shipcod.delivery/api/orders/apicreate"
              />
            </BlockStack>
            <Text as="p" variant="bodySm" tone="subdued">
              This webhook sends new Shopify orders to your ShipCOD dashboard
              automatically. No manual configuration is required.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>

      {/* Disconnect confirmation modal */}
      <Modal
        open={showDisconnectModal}
        onClose={() => setShowDisconnectModal(false)}
        title="Disconnect ShipCOD?"
        primaryAction={{
          content: "Disconnect",
          destructive: true,
          onAction: handleDisconnect,
          loading: isDisconnecting,
        }}
        secondaryActions={[
          {
            content: "Cancel",
            onAction: () => setShowDisconnectModal(false),
          },
        ]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">
              Disconnecting will delete the Shopify webhook. New orders will no
              longer be sent to ShipCOD.
            </Text>
            <Text as="p" tone="subdued">
              Your ShipCOD account and existing orders will not be affected.
            </Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

// ─── Helper component ─────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  isSensitive = false,
}: {
  label: string;
  value: string;
  isSensitive?: boolean;
}) {
  return (
    <Box
      background="bg-surface-secondary"
      padding="300"
      borderRadius="200"
    >
      <InlineStack align="space-between" blockAlign="center">
        <Text as="span" variant="bodySm" tone="subdued">
          {label}
        </Text>
        <InlineStack gap="200" blockAlign="center">
          {isSensitive && (
            <Badge tone="warning" size="small">
              Encrypted
            </Badge>
          )}
          <Text as="span" variant="bodySm" fontWeight="semibold">
            {value}
          </Text>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}
