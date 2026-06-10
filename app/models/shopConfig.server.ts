import db from "~/db.server";
import { encrypt, decrypt, maskSecret } from "~/utils/crypto.server";

export type ShopConfigStatus = {
  isConnected: boolean;
  shop: string;
  maskedKeyCode: string | null;
  maskedSecret: string | null;
  webhookId: string | null;
};

/**
 * Returns the masked/safe public view of a shop's config.
 * Never returns the raw SECRET_CODE.
 */
export async function getShopConfigStatus(
  shop: string
): Promise<ShopConfigStatus | null> {
  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config) return null;

  return {
    isConnected: config.isConnected,
    shop: config.shop,
    maskedKeyCode: maskSecret(config.keyCode),
    maskedSecret: maskSecret(decrypt(config.encryptedSecret)),
    webhookId: config.webhookId,
  };
}

/**
 * Upserts the ShipCOD credentials and webhook ID for a shop.
 * Encrypts SECRET_CODE before writing.
 */
export async function saveShopConfig(params: {
  shop: string;
  keyCode: string;
  secretCode: string;
  webhookId: string;
}): Promise<void> {
  const encryptedSecret = encrypt(params.secretCode);
  await db.shopConfig.upsert({
    where: { shop: params.shop },
    create: {
      shop: params.shop,
      keyCode: params.keyCode,
      encryptedSecret,
      webhookId: params.webhookId,
      isConnected: true,
    },
    update: {
      keyCode: params.keyCode,
      encryptedSecret,
      webhookId: params.webhookId,
      isConnected: true,
    },
  });
}

/**
 * Marks a shop as disconnected, clears credentials and webhook ID.
 */
export async function disconnectShop(shop: string): Promise<void> {
  await db.shopConfig.updateMany({
    where: { shop },
    data: {
      isConnected: false,
      webhookId: null,
    },
  });
}

/**
 * Fully removes a shop's config record (used on app uninstall).
 */
export async function deleteShopConfig(shop: string): Promise<void> {
  await db.shopConfig.deleteMany({ where: { shop } });
}

/**
 * Returns the raw (decrypted) credentials for a shop.
 * Only used server-side for webhook operations — never sent to the client.
 */
export async function getShopCredentials(
  shop: string
): Promise<{ keyCode: string; secretCode: string; webhookId: string | null } | null> {
  const config = await db.shopConfig.findUnique({ where: { shop } });
  if (!config) return null;
  return {
    keyCode: config.keyCode,
    secretCode: decrypt(config.encryptedSecret),
    webhookId: config.webhookId,
  };
}
