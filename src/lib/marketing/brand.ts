import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { buildStorefrontUrl } from "@/lib/domains/storefront";
import { DEFAULT_BRAND, type EmailBrand } from "./email-layout";

// Brand kit colours and logo for emails, store links, and signed unsubscribe links for automation emails
// (campaign emails use their CampaignRecipient token instead).

export interface MarketingStore {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  logoUrl: string | null;
  brandSettings: unknown;
  status: string;
  currency: string;
}

export const MARKETING_STORE_SELECT = { id: true, name: true, slug: true, customDomain: true, logoUrl: true, brandSettings: true, status: true, currency: true } as const;

export function emailBrand(store: MarketingStore): EmailBrand {
  const tokens = readStoreLook(store).tokens;
  return {
    storeName: store.name,
    logoUrl: store.logoUrl,
    accent: toHex6(tokens?.ctaBg && tokens.ctaBg.toUpperCase() !== "#FFFFFF" ? tokens.ctaBg : tokens?.accent, DEFAULT_BRAND.accent),
    ink: toHex6(tokens?.ink, DEFAULT_BRAND.ink),
    paper: toHex6(tokens?.paperBg, DEFAULT_BRAND.paper),
  };
}

export function storeUrl(store: { slug: string; customDomain: string | null }, path = "/") {
  return buildStorefrontUrl({ slug: store.slug, customDomain: store.customDomain }, path);
}

export function appUrl() {
  return (process.env.NEXT_PUBLIC_APP_URL ?? process.env.APP_URL ?? "https://app.shopinbos.com").replace(/\/$/, "");
}

function linkSecret() {
  return process.env.MARKETING_LINK_SECRET || process.env.CRON_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.JWT_SECRET || "";
}

function sign(payload: string) {
  return createHmac("sha256", linkSecret()).update(payload).digest("base64url").slice(0, 32);
}

/** Unsubscribe link for an automation email: /api/public/marketing/unsubscribe?t=<store.email.sig>. */
export function unsubscribeUrl(storeId: string, email: string) {
  const payload = Buffer.from(`${storeId}\n${email.toLowerCase()}`).toString("base64url");
  return `${appUrl()}/api/public/marketing/unsubscribe?t=${payload}.${sign(payload)}`;
}

export function readUnsubscribeToken(token: string | null): { storeId: string; email: string } | null {
  if (!token || !linkSecret()) return null;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  const [storeId, email] = Buffer.from(payload, "base64url").toString("utf8").split("\n");
  return storeId && email ? { storeId, email } : null;
}

// Key for Peggy's confirmation codes. Never a hard-coded fallback: in production with no secret set nothing can
// be confirmed (fail closed); in development a random per-process key keeps the flow usable.
let devConfirmationKey: string | null = null;
function confirmationKey() {
  const secret = linkSecret();
  if (secret) return secret;
  if (process.env.NODE_ENV === "production") return null;
  devConfirmationKey ??= randomBytes(32).toString("hex");
  return devConfirmationKey;
}

/** Short-lived code Peggy must echo back before anything is sent (proves the seller saw the preview). */
export function confirmationCode(parts: string[], now = Date.now()) {
  const key = confirmationKey();
  if (!key) {
    console.error("[marketing] MARKETING_LINK_SECRET (or CRON_SECRET) is not set: confirmations are disabled");
    return "UNAVAILABLE";
  }
  const window = Math.floor(now / (30 * 60_000));
  return createHmac("sha256", key).update(`${parts.join("|")}|${window}`).digest("hex").slice(0, 6).toUpperCase();
}

export function checkConfirmationCode(code: string | null | undefined, parts: string[], now = Date.now()) {
  if (!code || !confirmationKey()) return false;
  const wanted = code.trim().toUpperCase();
  // Accept the current and previous 30-minute window.
  return wanted === confirmationCode(parts, now) || wanted === confirmationCode(parts, now - 30 * 60_000);
}
