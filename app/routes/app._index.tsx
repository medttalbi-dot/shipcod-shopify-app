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
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useCallback, useState } from "react";
import { authenticate } from "~/shopify.server";
import { getShopConfigStatus } from "~/models/shopConfig.server";
import {
  connectShipCodWebhook,
} from "~/services/webhook.server";
import { saveShopConfig } from "~/models/shopConfig.server";

// ─── Types ───────────────────────────────────────────────────────────────────

type LoaderData = {
  shop: string;
  isConnected: boolean;
  maskedKeyCode: string | null;
};

type ActionData =
  | { success: true }
  | { success: false; error: string; fieldErrors?: Record<string, string> };

// ─── Loader ──────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const config = await getShopConfigStatus(session.shop);

  // If already connected, go straight to settings
  if (config?.isConnected) {
    return redirect("/app/settings");
  }

  return json<LoaderData>({
    shop: session.shop,
    isConnected: false,
    maskedKeyCode: config?.maskedKeyCode ?? null,
  });
};

// ─── Action ──────────────────────────────────────────────────────────────────

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);

  const formData = await request.formData();
  const keyCode = String(formData.get("keyCode") ?? "").trim();
  const secretCode = String(formData.get("secretCode") ?? "").trim();

  // Validation
  const fieldErrors: Record<string, string> = {};
  if (!keyCode) fieldErrors.keyCode = "KEY_CODE is required";
  if (!secretCode) fieldErrors.secretCode = "SECRET_CODE is required";
  if (Object.keys(fieldErrors).length > 0) {
    return json<ActionData>(
      { success: false, error: "Please fill in all fields.", fieldErrors },
      { status: 422 }
    );
  }

  try {
    const webhookId = await connectShipCodWebhook(
      admin,
      keyCode,
      secretCode
    );

    await saveShopConfig({
      shop: session.shop,
      keyCode,
      secretCode,
      webhookId,
    });

    console.log(
      `[ShipCOD] Connected shop ${session.shop}, webhook ${webhookId}`
    );

    return redirect("/app/settings");
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "An unexpected error occurred.";
    console.error(`[ShipCOD] Connect error for ${session.shop}:`, err);
    return json<ActionData>(
      { success: false, error: message },
      { status: 500 }
    );
  }
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function ConnectPage() {
  const { shop } = useLoaderData<LoaderData>();
  const actionData = useActionData<ActionData>();
  const navigation = useNavigation();
  const submit = useSubmit();

  const [keyCode, setKeyCode] = useState("");
  const [secretCode, setSecretCode] = useState("");

  const isLoading = navigation.state === "submitting";
  const fieldErrors =
    actionData && !actionData.success ? actionData.fieldErrors ?? {} : {};
  const errorMessage =
    actionData && !actionData.success ? actionData.error : null;

  const handleConnect = useCallback(() => {
    const formData = new FormData();
    formData.append("keyCode", keyCode);
    formData.append("secretCode", secretCode);
    submit(formData, { method: "post" });
  }, [keyCode, secretCode, submit]);

  return (
    <Page>
      <BlockStack gap="800">
        {/* Header branding */}
        <Box paddingBlockStart="600">
          <BlockStack gap="200" align="center">
            <InlineStack gap="300" align="center" blockAlign="center">
              <ShipCodLogo />
              <Text variant="headingXl" as="h1" fontWeight="bold">
                ShipCOD
              </Text>
            </InlineStack>
            <Text variant="headingLg" as="p" tone="subdued">
              COD Fulfillment & Delivery
            </Text>
          </BlockStack>
        </Box>

        {/* Main connect card */}
        <Card>
          <BlockStack gap="600">
            {/* Status */}
            <InlineStack align="space-between" blockAlign="center">
              <Text variant="headingMd" as="h2">
                Connect to Shopify
              </Text>
              <Badge tone="warning">Not connected</Badge>
            </InlineStack>

            <Divider />

            {/* Description */}
            <Banner tone="info">
              <Text as="p">
                Connect your Shopify store to ShipCOD in one click. No manual
                webhook setup required. Once connected, new orders will
                automatically sync to your ShipCOD dashboard.
              </Text>
            </Banner>

            {/* Error banner */}
            {errorMessage && (
              <Banner tone="critical" title="Connection failed">
                <Text as="p">{errorMessage}</Text>
              </Banner>
            )}

            {/* Store info */}
            <Box
              background="bg-surface-secondary"
              padding="300"
              borderRadius="200"
            >
              <InlineStack gap="200" blockAlign="center">
                <Text as="span" tone="subdued" variant="bodySm">
                  Store:
                </Text>
                <Text as="span" variant="bodySm" fontWeight="semibold">
                  {shop}
                </Text>
              </InlineStack>
            </Box>

            {/* Credential fields */}
            <FormLayout>
              <TextField
                label="KEY_CODE"
                value={keyCode}
                onChange={setKeyCode}
                autoComplete="off"
                placeholder="Enter your ShipCOD KEY_CODE"
                error={fieldErrors.keyCode}
                helpText="Found in your ShipCOD account under API Settings."
                disabled={isLoading}
              />
              <TextField
                label="SECRET_CODE"
                value={secretCode}
                onChange={setSecretCode}
                type="password"
                autoComplete="new-password"
                placeholder="Enter your ShipCOD SECRET_CODE"
                error={fieldErrors.secretCode}
                helpText="Your secret will be encrypted and never shown again."
                disabled={isLoading}
              />
            </FormLayout>

            {/* Connect button */}
            <Box>
              <Button
                variant="primary"
                size="large"
                onClick={handleConnect}
                loading={isLoading}
                disabled={isLoading}
                fullWidth
              >
                {isLoading ? "Connecting…" : "Connect ShipCOD"}
              </Button>
            </Box>

            {/* What happens section */}
            <Divider />
            <BlockStack gap="200">
              <Text variant="headingXs" as="h3" tone="subdued">
                What happens when you connect?
              </Text>
              <BlockStack gap="100">
                {[
                  "A Shopify webhook is automatically registered for new orders.",
                  "New orders will sync to ShipCOD instantly.",
                  "No manual webhook URL or API version setup needed.",
                  "You can disconnect at any time from the Settings page.",
                ].map((item, i) => (
                  <InlineStack key={i} gap="200" blockAlign="start">
                    <Text as="span" tone="success">
                      ✓
                    </Text>
                    <Text as="span" variant="bodySm">
                      {item}
                    </Text>
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

// ─── ShipCOD logo SVG ─────────────────────────────────────────────────────────

function ShipCodLogo() {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="ShipCOD logo"
    >
      <rect width="40" height="40" rx="8" fill="#2563EB" />
      <path
        d="M8 14h24M8 20h16M8 26h20"
        stroke="white"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <circle cx="30" cy="26" r="4" fill="#10B981" />
    </svg>
  );
}
