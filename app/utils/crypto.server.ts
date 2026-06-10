import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

function getKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length !== 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 64-character hex string (32 bytes). " +
        "Generate with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\""
    );
  }
  return Buffer.from(key, "hex");
}

/**
 * Encrypts a plaintext string using AES-256-GCM.
 * Returns a base64 string containing: IV (12 bytes) + AuthTag (16 bytes) + Ciphertext
 */
export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString("base64");
}

/**
 * Decrypts a base64 string produced by encrypt().
 */
export function decrypt(encryptedBase64: string): string {
  const data = Buffer.from(encryptedBase64, "base64");
  const iv = data.subarray(0, IV_LENGTH);
  const authTag = data.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = data.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, getKey(), iv);
  decipher.setAuthTag(authTag);
  return (
    decipher.update(ciphertext).toString("utf8") +
    decipher.final().toString("utf8")
  );
}

/**
 * Returns a masked version of a sensitive value.
 * Shows first 3 characters then asterisks.
 */
export function maskSecret(value: string): string {
  if (value.length <= 3) return "***";
  return value.substring(0, 3) + "*".repeat(Math.min(value.length - 3, 8));
}
