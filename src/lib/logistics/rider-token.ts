import { createHash, randomBytes } from "node:crypto";

// Riders app links: the rider's private link carries a random token; only its SHA-256 is stored.

export function newRiderToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashRiderToken(token) };
}

export function hashRiderToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** 32 random bytes in base64url are always 43 characters. Anything else isn't worth a database lookup. */
export function isRiderTokenShape(token: string) {
  return /^[A-Za-z0-9_-]{43}$/.test(token);
}
