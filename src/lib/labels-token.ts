// Short-lived signed links to print shipping labels from the phone app. Pure (node:crypto only), unit-tested in
// tests/product-edit-labels.test.mjs.
//
// The app asks GET /api/app/labels (Bearer, seller) for a token, then opens /api/app/labels/print?token=… in the
// in-app browser, which can't send the Bearer header. A token is `<payload>.<signature>`: the payload is base64url
// JSON { u: userId, o: orderIds, e: expiry (ms) }, the signature an HMAC-SHA256 (base64url, 43 chars). It is good
// for LABEL_TOKEN_TTL_MS and only for those orders of that seller (the print route still checks the store owns them).

import { createHmac, timingSafeEqual } from "node:crypto";

export const LABEL_TOKEN_TTL_MS = 15 * 60 * 1000;

export function labelLinkSecret(env: Record<string, string | undefined> = process.env) {
  return env.LABEL_LINK_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.JWT_SECRET || "";
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(`labels:${payload}`).digest("base64url");
}

export function signLabelToken(input: { userId: string; orderIds: string[]; now?: number }, secret = labelLinkSecret()) {
  if (!secret) throw new Error("LABEL_LINK_SECRET (or CRON_SECRET) must be set to sign label links");
  const payload = Buffer.from(JSON.stringify({ u: input.userId, o: input.orderIds, e: (input.now ?? Date.now()) + LABEL_TOKEN_TTL_MS })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** The seller and orders when the token is genuine and not expired, else null. */
export function verifyLabelToken(token: string | null | undefined, secret = labelLinkSecret(), now = Date.now()): { userId: string; orderIds: string[] } | null {
  if (!token || !secret || token.length > 4000) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { u?: unknown; o?: unknown; e?: unknown };
    if (typeof data.u !== "string" || !data.u || typeof data.e !== "number" || data.e < now) return null;
    if (!Array.isArray(data.o) || !data.o.every((id) => typeof id === "string")) return null;
    return { userId: data.u, orderIds: data.o as string[] };
  } catch {
    return null;
  }
}
