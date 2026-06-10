import type { ActionFunctionArgs, LoaderFunctionArgs } from "@remix-run/node";
import { json } from "@remix-run/node";
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
  saveShopConfig,
  disconnectShop,
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
  | { intent: "connect"; success: true }
  | { intent: "connect"; success: false; error: string; fieldErrors?: Record<string, string> }
  | { intent: "disconnect"; success: true }
  | { intent: "disconnect"; success: false; error: string }
  | { intent: "reconnect"; success: true }
  | { intent: "reconnect"; success: false; error: string; fieldErrors?: Record<string, string> };

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getShopConfigStatus(session.shop);

  return json<LoaderData>({
    shop: session.shop,
    isConnected: config?.isConnected ?? false,
    maskedKeyCode: config?.maskedKeyCode ?? null,
    maskedSecret: config?.maskedSecret ?? null,
    webhookId: config?.webhookId ?? null,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const intent = String(formData.get("intent"));

  if (intent === "connect" || intent === "reconnect") {
    const keyCode = String(formData.get("keyCode") ?? "").trim();
    const secretCode = String(formData.get("secretCode") ?? "").trim();

    const fieldErrors: Record<string, string> = {};
    if (!keyCode) fieldErrors.keyCode = "KEY_CODE is required";
    if (!secretCode) fieldErrors.secretCode = "SECRET_CODE is required";
    if (Object.keys(fieldErrors).length > 0) {
      return json<ActionData>(
        { intent, success: false, error: "Please fill in all fields.", fieldErrors },
        { status: 422 }
      );
    }

    try {
      const webhookId = await connectShipCodWebhook(admin, keyCode, secretCode);
      await saveShopConfig({ shop: session.shop, keyCode, secretCode, webhookId });
      return json<ActionData>({ intent, success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "An unexpected error occurred.";
      return json<ActionData>({ intent, success: false, error: message }, { status: 500 });
    }
  }

  if (intent === "disconnect") {
    try {
      const credentials = await getShopCredentials(session.shop);
      await disconnectShipCodWebhook(admin, credentials?.webhookId ?? null);
      await disconnectShop(session.shop);
      return json<ActionData>({ intent: "disconnect", success: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to disconnect.";
      return json<ActionData>({ intent: "disconnect", success: false, error: message }, { status: 500 });
    }
  }

  return json({ error: "Unknown intent" }, { status: 400 });
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function AppIndex() {
  const loaderData = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [keyCode, setKeyCode] = useState("");
  const [secretCode, setSecretCode] = useState("");
  const [showReconnectForm, setShowReconnectForm] = useState(false);
  const [showDisconnectModal, setShowDisconnectModal] = useState(false);
  const [newKeyCode, setNewKeyCode] = useState("");
  const [newSecretCode, setNewSecretCode] = useState("");

  const isSubmitting = navigation.state === "submitting";
  const currentIntent = navigation.formData?.get("intent");

  // Derive connected state from latest action result
  const isConnected =
    actionData?.intent === "disconnect" && actionData.success
      ? false
      : (actionData?.intent === "connect" || actionData?.intent === "reconnect") && actionData.success
      ? true
      : loaderData.isConnected;

  const handleConnect = useCallback(() => {
    const fd = new FormData();
    fd.append("intent", "connect");
    fd.append("keyCode", keyCode);
    fd.append("secretCode", secretCode);
    submit(fd, { method: "post" });
  }, [keyCode, secretCode, submit]);

  const handleReconnect = useCallback(() => {
    const fd = new FormData();
    fd.append("intent", "reconnect");
    fd.append("keyCode", newKeyCode);
    fd.append("secretCode", newSecretCode);
    submit(fd, { method: "post" });
  }, [newKeyCode, newSecretCode, submit]);

  const handleDisconnect = useCallback(() => {
    const fd = new FormData();
    fd.append("intent", "disconnect");
    submit(fd, { method: "post" });
    setShowDisconnectModal(false);
  }, [submit]);

  if (!isConnected) {
    // ── Connect screen ────────────────────────────────────────────────────────
    const connectErrors =
      actionData?.intent === "connect" && !actionData.success
        ? actionData.fieldErrors ?? {}
        : {};
    const connectError =
      actionData?.intent === "connect" && !actionData.success
        ? actionData.error
        : null;

    return (
      <Page>
        <BlockStack gap="800">
          <Box paddingBlockStart="600">
            <BlockStack gap="200" align="center">
              <InlineStack gap="300" align="center" blockAlign="center">
                <ShipCodLogo />
                <Text variant="headingXl" as="h1" fontWeight="bold">ShipCOD</Text>
              </InlineStack>
              <Text variant="headingLg" as="p" tone="subdued">COD Fulfillment & Delivery</Text>
            </BlockStack>
          </Box>

          <Card>
            <BlockStack gap="600">
              <InlineStack align="space-between" blockAlign="center">
                <Text variant="headingMd" as="h2">Connect to Shopify</Text>
                <Badge tone="warning">Not connected</Badge>
              </InlineStack>
              <Divider />
              <Banner tone="info">
                <Text as="p">
                  Connect your Shopify store to ShipCOD in one click. No manual webhook setup required.
                  Once connected, new orders will automatically sync to your ShipCOD dashboard.
                </Text>
              </Banner>
              {connectError && (
                <Banner tone="critical" title="Connection failed">
                  <Text as="p">{connectError}</Text>
                </Banner>
              )}
              <Box background="bg-surface-secondary" padding="300" borderRadius="200">
                <InlineStack gap="200" blockAlign="center">
                  <Text as="span" tone="subdued" variant="bodySm">Store:</Text>
                  <Text as="span" variant="bodySm" fontWeight="semibold">{loaderData.shop}</Text>
                </InlineStack>
              </Box>
              <FormLayout>
                <TextField
                  label="KEY_CODE"
                  value={keyCode}
                  onChange={setKeyCode}
                  autoComplete="off"
                  placeholder="Enter your ShipCOD KEY_CODE"
                  error={connectErrors.keyCode}
                  helpText="Found in your ShipCOD account under API Settings."
                  disabled={isSubmitting}
                />
                <TextField
                  label="SECRET_CODE"
                  value={secretCode}
                  onChange={setSecretCode}
                  type="password"
                  autoComplete="new-password"
                  placeholder="Enter your ShipCOD SECRET_CODE"
                  error={connectErrors.secretCode}
                  helpText="Your secret will be encrypted and never shown again."
                  disabled={isSubmitting}
                />
              </FormLayout>
              <Button
                variant="primary"
                size="large"
                onClick={handleConnect}
                loading={isSubmitting && currentIntent === "connect"}
                disabled={isSubmitting}
                fullWidth
              >
                {isSubmitting && currentIntent === "connect" ? "Connecting…" : "Connect ShipCOD"}
              </Button>
              <Divider />
              <BlockStack gap="200">
                <Text variant="headingXs" as="h3" tone="subdued">What happens when you connect?</Text>
                <BlockStack gap="100">
                  {[
                    "A Shopify webhook is automatically registered for new orders.",
                    "New orders will sync to ShipCOD instantly.",
                    "No manual webhook URL or API version setup needed.",
                    "You can disconnect at any time from this page.",
                  ].map((item, i) => (
                    <InlineStack key={i} gap="200" blockAlign="start">
                      <Text as="span" tone="success">✓</Text>
                      <Text as="span" variant="bodySm">{item}</Text>
                    </InlineStack>
                  ))}
                </BlockStack>
              </BlockStack>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    );
  }

  // ── Settings screen ─────────────────────────────────────────────────────────
  const reconnectErrors =
    actionData?.intent === "reconnect" && !actionData.success
      ? actionData.fieldErrors ?? {}
      : {};
  const reconnectError =
    actionData?.intent === "reconnect" && !actionData.success ? actionData.error : null;
  const disconnectError =
    actionData?.intent === "disconnect" && !actionData.success ? actionData.error : null;

  return (
    <Page title="ShipCOD Settings" subtitle="Manage your ShipCOD integration">
      <BlockStack gap="600">
        {disconnectError && (
          <Banner tone="critical" title="Disconnect failed"><Text as="p">{disconnectError}</Text></Banner>
        )}
        {actionData?.intent === "reconnect" && actionData.success && !showReconnectForm && (
          <Banner tone="success" title="Credentials updated">
            <Text as="p">Your ShipCOD webhook has been updated with the new credentials.</Text>
          </Banner>
        )}

        <Card>
          <BlockStack gap="400">
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">Connection Status</Text>
              <Badge tone="success">Connected</Badge>
            </InlineStack>
            <Divider />
            <BlockStack gap="300">
              <InfoRow label="Store" value={loaderData.shop} />
              <InfoRow label="KEY_CODE" value={loaderData.maskedKeyCode ?? "—"} />
              <InfoRow label="SECRET_CODE" value={loaderData.maskedSecret ?? "—"} isSensitive />
              {loaderData.webhookId && (
                <InfoRow label="Webhook ID" value={loaderData.webhookId.split("/").pop() ?? loaderData.webhookId} />
              )}
            </BlockStack>
            <Divider />
            <InlineStack gap="300">
              <Button
                tone="critical"
                onClick={() => setShowDisconnectModal(true)}
                disabled={isSubmitting}
              >
                Disconnect
              </Button>
              <Button
                onClick={() => { setShowReconnectForm(v => !v); setNewKeyCode(""); setNewSecretCode(""); }}
                disabled={isSubmitting}
              >
                Update Credentials
              </Button>
            </InlineStack>
          </BlockStack>
        </Card>

        {showReconnectForm && (
          <Card>
            <BlockStack gap="400">
              <Text variant="headingMd" as="h2">Update Credentials</Text>
              <Text as="p" tone="subdued" variant="bodySm">
                The old webhook will be deleted and a new one created automatically.
              </Text>
              {reconnectError && <Banner tone="critical"><Text as="p">{reconnectError}</Text></Banner>}
              <FormLayout>
                <TextField
                  label="New KEY_CODE"
                  value={newKeyCode}
                  onChange={setNewKeyCode}
                  autoComplete="off"
                  placeholder="Enter new KEY_CODE"
                  error={reconnectErrors.keyCode}
                  disabled={isSubmitting}
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
                  disabled={isSubmitting}
                />
              </FormLayout>
              <InlineStack gap="300">
                <Button
                  variant="primary"
                  onClick={handleReconnect}
                  loading={isSubmitting && currentIntent === "reconnect"}
                  disabled={isSubmitting}
                >
                  {isSubmitting && currentIntent === "reconnect" ? "Updating…" : "Update & Reconnect"}
                </Button>
                <Button onClick={() => setShowReconnectForm(false)} disabled={isSubmitting}>Cancel</Button>
              </InlineStack>
            </BlockStack>
          </Card>
        )}

        <Card>
          <BlockStack gap="300">
            <Text variant="headingMd" as="h2">About this integration</Text>
            <BlockStack gap="200">
              <InfoRow label="Webhook topic" value="orders/create" />
              <InfoRow label="Webhook format" value="JSON" />
              <InfoRow label="Webhook URL" value="https://api.shipcod.delivery/api/orders/apicreate" />
            </BlockStack>
            <Text as="p" variant="bodySm" tone="subdued">
              This webhook sends new Shopify orders to your ShipCOD dashboard automatically.
            </Text>
          </BlockStack>
        </Card>
      </BlockStack>

      <Modal
        open={showDisconnectModal}
        onClose={() => setShowDisconnectModal(false)}
        title="Disconnect ShipCOD?"
        primaryAction={{ content: "Disconnect", destructive: true, onAction: handleDisconnect, loading: isSubmitting }}
        secondaryActions={[{ content: "Cancel", onAction: () => setShowDisconnectModal(false) }]}
      >
        <Modal.Section>
          <BlockStack gap="300">
            <Text as="p">Disconnecting will delete the Shopify webhook. New orders will no longer be sent to ShipCOD.</Text>
            <Text as="p" tone="subdued">Your ShipCOD account and existing orders will not be affected.</Text>
          </BlockStack>
        </Modal.Section>
      </Modal>
    </Page>
  );
}

function ShipCodLogo() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="40" height="40" rx="8" fill="#2563EB" />
      <path d="M8 14h24M8 20h16M8 26h20" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="30" cy="26" r="4" fill="#10B981" />
    </svg>
  );
}

function InfoRow({ label, value, isSensitive = false }: { label: string; value: string; isSensitive?: boolean }) {
  return (
    <Box background="bg-surface-secondary" padding="300" borderRadius="200">
      <InlineStack align="space-between" blockAlign="center">
        <Text as="span" variant="bodySm" tone="subdued">{label}</Text>
        <InlineStack gap="200" blockAlign="center">
          {isSensitive && <Badge tone="warning" size="small">Encrypted</Badge>}
          <Text as="span" variant="bodySm" fontWeight="semibold">{value}</Text>
        </InlineStack>
      </InlineStack>
    </Box>
  );
}
