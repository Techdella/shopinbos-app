// Signed links for unsubscribe and the preference center. Pure (node:crypto only), unit-tested.
//
// A token is `<payload>.<signature>`: the payload is base64url text, the signature the first 32 characters of an
// HMAC-SHA256 (base64url) under MARKETING_LINK_SECRET (falling back to CRON_SECRET, the service role key, JWT_SECRET).
// Two audiences:
//   store contact (B):  "<storeId>\n<email>"   — the format automation unsubscribe links have always used
//   Shopinbos user (A): "u\n<userId>"
// Tokens never expire: an unsubscribe link in an old email must keep working.

import { createHmac, timingSafeEqual } from "node:crypto";

export type EmailLinkTarget = { kind: "contact"; storeId: string; email: string } | { kind: "user"; userId: string };

export function emailLinkSecret(env: Record<string, string | undefined> = process.env) {
  return env.MARKETING_LINK_SECRET || env.CRON_SECRET || env.SUPABASE_SERVICE_ROLE_KEY || env.JWT_SECRET || "";
}

function sign(payload: string, secret: string) {
  return createHmac("sha256", secret).update(payload).digest("base64url").slice(0, 32);
}

export function signEmailToken(target: EmailLinkTarget, secret = emailLinkSecret()) {
  if (!secret) throw new Error("MARKETING_LINK_SECRET (or CRON_SECRET) must be set to sign email links");
  const text = target.kind === "user" ? `u\n${target.userId}` : `${target.storeId}\n${target.email.trim().toLowerCase()}`;
  const payload = Buffer.from(text).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

export function verifyEmailToken(token: string | null | undefined, secret = emailLinkSecret()): EmailLinkTarget | null {
  if (!token || !secret || token.length > 600) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const parts = Buffer.from(payload, "base64url").toString("utf8").split("\n");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  if (parts[0] === "u") return { kind: "user", userId: parts[1] };
  return { kind: "contact", storeId: parts[0], email: parts[1] };
}

export interface EmailLinks {
  token: string;
  /** The preference center (GET page). */
  preferences: string;
  /** Footer "Unsubscribe": the preference center with the confirm step. */
  unsubscribe: string;
  /** RFC 8058 one-click target (POST, no login, no CSRF). */
  oneClick: string;
}

export function emailLinks(appUrl: string, target: EmailLinkTarget, secret = emailLinkSecret()): EmailLinks {
  const base = appUrl.replace(/\/+$/, "");
  const token = signEmailToken(target, secret);
  return {
    token,
    preferences: `${base}/email/preferences/${token}`,
    unsubscribe: `${base}/email/preferences/${token}?unsubscribe=1`,
    oneClick: `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`,
  };
}
