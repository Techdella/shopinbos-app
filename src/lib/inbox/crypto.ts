// Channel credentials (access tokens, auth tokens, bot tokens, app secrets) are encrypted at rest with
// AES-256-GCM. The key comes from INBOX_ENCRYPTION_KEY (32 bytes as base64 or hex, or any long passphrase,
// which is hashed). Without a key we refuse to store credentials rather than keep them in plain text.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "v1";

function keyFrom(secret: string): Buffer {
  const trimmed = secret.trim();
  if (/^[0-9a-f]{64}$/i.test(trimmed)) return Buffer.from(trimmed, "hex");
  const b64 = Buffer.from(trimmed, "base64");
  if (b64.length === 32 && /^[A-Za-z0-9+/=_-]+$/.test(trimmed)) return b64;
  return createHash("sha256").update(trimmed, "utf8").digest();
}

export function credentialKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const secret = env.INBOX_ENCRYPTION_KEY;
  return secret && secret.trim().length >= 16 ? keyFrom(secret) : null;
}

export function hasCredentialKey() {
  return credentialKey() !== null;
}

export function encryptJson(value: unknown, key: Buffer | null = credentialKey()): string {
  if (!key) throw new Error("INBOX_ENCRYPTION_KEY is not set, so channel credentials can't be stored safely.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return [PREFIX, iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

export function decryptJson<T = Record<string, string>>(payload: string | null | undefined, key: Buffer | null = credentialKey()): T | null {
  if (!payload || !key) return null;
  const [version, iv, tag, data] = payload.split(":");
  if (version !== PREFIX || !iv || !tag || !data) return null;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    const text = Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** A random URL-safe secret (Meta verify tokens, Telegram secret tokens). */
export function randomSecret(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}
