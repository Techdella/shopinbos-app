// Meta's signed_request (Deauthorize and Data Deletion callbacks, Facebook Login): "<signature>.<payload>", both
// base64url. The signature is HMAC-SHA256 of the payload *as sent* (the base64url text), keyed with the app secret;
// the payload is JSON with algorithm "HMAC-SHA256" and user_id, the app-scoped ID of the person who removed the app.
// Pure (node:crypto only) so tests load it directly.

import { createHash, createHmac, randomInt, timingSafeEqual } from "node:crypto";

export interface MetaSignedRequest {
  userId: string;
  issuedAt: number | null;
  payload: Record<string, unknown>;
}

function fromBase64Url(value: string) {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** The verified payload, or null for anything malformed, wrongly signed or without a user_id. */
export function parseSignedRequest(signedRequest: string | null | undefined, appSecret: string | null | undefined): MetaSignedRequest | null {
  if (!signedRequest || !appSecret) return null;
  const parts = signedRequest.trim().split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  const [encodedSig, encodedPayload] = parts;

  const sent = fromBase64Url(encodedSig);
  const expected = createHmac("sha256", appSecret).update(encodedPayload, "utf8").digest();
  if (sent.length !== expected.length || !timingSafeEqual(sent, expected)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(fromBase64Url(encodedPayload).toString("utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!payload || typeof payload !== "object") return null;
  if (String(payload.algorithm ?? "").toUpperCase() !== "HMAC-SHA256") return null;
  const userId = typeof payload.user_id === "string" || typeof payload.user_id === "number" ? String(payload.user_id) : "";
  if (!/^\d{1,32}$/.test(userId)) return null;
  const issuedAt = typeof payload.issued_at === "number" ? payload.issued_at : null;
  return { userId, issuedAt, payload };
}

/** Builds a signed_request the way Meta does (tests, and a manual check against a deployed callback). */
export function signRequest(payload: Record<string, unknown>, appSecret: string) {
  const encodedPayload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", ...payload })).toString("base64url");
  const sig = createHmac("sha256", appSecret).update(encodedPayload, "utf8").digest("base64url");
  return `${sig}.${encodedPayload}`;
}

/** Meta's callbacks post form-encoded (signed_request=…); accept JSON too. */
export function signedRequestFromBody(rawBody: string, contentType: string | null | undefined) {
  if ((contentType ?? "").includes("application/json")) {
    try {
      const json = JSON.parse(rawBody) as { signed_request?: unknown };
      return typeof json.signed_request === "string" ? json.signed_request : null;
    } catch {
      return null;
    }
  }
  return new URLSearchParams(rawBody).get("signed_request");
}

/** Deletion requests keep a hash, not the Meta user ID itself. */
export function hashMetaUserId(userId: string) {
  return createHash("sha256").update(`meta-user:${userId}`).digest("hex");
}

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

/** The confirmation code Meta shows the person: 12 characters without look-alikes (0/O, 1/I). */
export function newConfirmationCode() {
  let code = "";
  for (let i = 0; i < 12; i += 1) code += CODE_ALPHABET[randomInt(CODE_ALPHABET.length)];
  return code;
}

export function isConfirmationCode(value: string | null | undefined): value is string {
  return typeof value === "string" && /^[A-HJ-NP-Z2-9]{12}$/.test(value);
}
