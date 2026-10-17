// OPay Checkout signatures (https://documentation.opaycheckout.com/api-signature and /callback-signature). Pure
// (node:crypto only) so tests/opay.test.mjs can load it directly; src/lib/opay.ts makes the calls.
//
// API calls (status, refund): the JSON body with its keys sorted alphabetically at every level, signed with the
// secret key using HMAC-SHA512, hex. The exact string signed is the body sent, so signedBody returns both.
// Callbacks: HMAC-SHA3-512 (secret key) of a fixed template built from the payload, lowercase hex, sent as `sha512`.

import { createHmac, timingSafeEqual } from "node:crypto";

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .filter((key) => (value as Record<string, unknown>)[key] !== undefined)
        .sort()
        .map((key) => [key, sortKeys((value as Record<string, unknown>)[key])]),
    );
  }
  return value;
}

/** The body to send and its signature (the Bearer token for signed calls). */
export function signedBody(payload: Record<string, unknown>, secretKey: string) {
  const body = JSON.stringify(sortKeys(payload));
  return { body, signature: createHmac("sha512", secretKey).update(body).digest("hex") };
}

export interface OpayCallbackPayload {
  amount?: unknown;
  currency?: unknown;
  reference?: unknown;
  refunded?: unknown;
  status?: unknown;
  timestamp?: unknown;
  token?: unknown;
  transactionId?: unknown;
  [key: string]: unknown;
}

const text = (value: unknown) => (value === undefined || value === null ? "" : String(value));

/** The string OPay signs for a callback: fixed field order, Refunded as an unquoted t or f. */
export function callbackSignedString(payload: OpayCallbackPayload) {
  const refunded = payload.refunded === true || payload.refunded === "true" ? "t" : "f";
  return `{Amount:"${text(payload.amount)}",Currency:"${text(payload.currency)}",Reference:"${text(payload.reference)}",Refunded:${refunded},Status:"${text(payload.status)}",Timestamp:"${text(payload.timestamp)}",Token:"${text(payload.token)}",TransactionID:"${text(payload.transactionId)}"}`;
}

export function callbackSignature(payload: OpayCallbackPayload, secretKey: string) {
  return createHmac("sha3-512", secretKey).update(callbackSignedString(payload), "utf8").digest("hex");
}

/** Whether a callback's `sha512` is OPay's signature of its payload (case-insensitive hex, constant time). */
export function verifyCallbackSignature(payload: OpayCallbackPayload, sha512: unknown, secretKey: string) {
  if (typeof sha512 !== "string" || !/^[0-9a-f]+$/i.test(sha512)) return false;
  const expected = Buffer.from(callbackSignature(payload, secretKey), "hex");
  const given = Buffer.from(sha512.toLowerCase(), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** OPay order statuses. Only SUCCESS is money received; FAIL and CLOSE are final; INITIAL and PENDING may still pay. */
export type OpayStatus = "INITIAL" | "PENDING" | "SUCCESS" | "FAIL" | "CLOSE";

export function readOpayStatus(value: unknown): OpayStatus | null {
  return value === "INITIAL" || value === "PENDING" || value === "SUCCESS" || value === "FAIL" || value === "CLOSE" ? value : null;
}

/** OPay's own success code (the docs also mention "00" in places). */
export function opayOk(code: unknown) {
  return code === "00000" || code === "00";
}
