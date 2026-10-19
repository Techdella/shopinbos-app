// Korapay webhooks and charge statuses (https://developers.korapay.com/docs/webhooks). Pure (node:crypto only) so
// tests/korapay.test.mjs can load it directly; src/lib/korapay.ts makes the calls.
//
// Each webhook carries x-korapay-signature: HMAC-SHA256 (secret key, hex) of ONLY the payload's `data` object as
// JSON.stringify writes it, which is what Korapay's own Node sample checks.

import { createHmac, timingSafeEqual } from "node:crypto";

export function korapaySignature(data: unknown, secretKey: string) {
  return createHmac("sha256", secretKey).update(JSON.stringify(data)).digest("hex");
}

/** Whether `signature` is Korapay's signature of this webhook's data (case-insensitive hex, constant time). */
export function verifyKorapaySignature(data: unknown, signature: unknown, secretKey: string) {
  if (data === undefined || typeof signature !== "string" || !/^[0-9a-f]+$/i.test(signature)) return false;
  const expected = Buffer.from(korapaySignature(data, secretKey), "hex");
  const given = Buffer.from(signature.toLowerCase(), "hex");
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/** Korapay charge statuses as ours: only "success" is money received; failed and expired are final. */
export function korapayChargeState(status: unknown): "success" | "failed" | "waiting" {
  if (status === "success") return "success";
  if (status === "failed" || status === "expired") return "failed";
  return "waiting";
}

/**
 * Korapay sends amounts in naira (major units), sometimes as strings ("2000.00"). As kobo, or null when missing.
 * amount_paid wins over amount: an underpaid bank transfer has the full amount but less paid.
 */
export function korapayPaidKobo(data: { amount?: unknown; amount_paid?: unknown }) {
  const raw = data.amount_paid ?? data.amount;
  const naira = typeof raw === "number" ? raw : typeof raw === "string" && raw.trim() !== "" ? Number(raw) : NaN;
  return Number.isFinite(naira) ? Math.round(naira * 100) : null;
}
