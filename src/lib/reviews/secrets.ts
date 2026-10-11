import "server-only";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

// OAuth tokens for review sources are encrypted at rest with AES-256-GCM when INTEGRATIONS_ENCRYPTION_KEY is
// set (any long random string; it is hashed to a 32-byte key). Without it they are stored as-is, server-side
// only. Values written before the key was set still read back.

const PREFIX = "enc:v1:";

function key() {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  return raw ? createHash("sha256").update(raw).digest() : null;
}

export function sealSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  const k = key();
  if (!k) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${PREFIX}${Buffer.concat([iv, cipher.getAuthTag(), data]).toString("base64url")}`;
}

export function openSecret(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith(PREFIX)) return value;
  const k = key();
  if (!k) return null;
  try {
    const raw = Buffer.from(value.slice(PREFIX.length), "base64url");
    const decipher = createDecipheriv("aes-256-gcm", k, raw.subarray(0, 12));
    decipher.setAuthTag(raw.subarray(12, 28));
    return Buffer.concat([decipher.update(raw.subarray(28)), decipher.final()]).toString("utf8");
  } catch {
    return null;
  }
}

export function encryptionConfigured() {
  return Boolean(process.env.INTEGRATIONS_ENCRYPTION_KEY);
}

/** Secret that signs review links. A dedicated one is best; the service key is a stable fallback. */
export function reviewLinkSecret() {
  return process.env.REVIEW_LINK_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || "";
}
