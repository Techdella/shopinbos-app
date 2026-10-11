// Normalising where a storefront visit came from (?ref= / ?utm_source= / ?utm_campaign=). Pure, unit tested.

import { channelFromRef } from "../../../shared/channels.ts";

export const STORE_METRICS = ["visit", "product_view", "add_to_cart", "checkout_start"] as const;
export type StoreMetric = (typeof STORE_METRICS)[number];

const OTHER_SOURCES: Record<string, string> = { x: "x", twitter: "x", tw: "x", tco: "x", google: "google", gmc: "google", sms: "sms" };

/**
 * A known channel key (whatsapp, instagram, google…) for a ref/utm_source, a short cleaned name for other
 * sources (e.g. "x", "newsletter2"), or "" when nothing usable was given.
 */
export function normalizeSource(value: string | null | undefined) {
  const known = channelFromRef(value);
  if (known) return known;
  const key = (value ?? "").trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 24);
  if (!key) return "";
  return OTHER_SOURCES[key.replace(/[^a-z]/g, "")] ?? key;
}

/** utm_campaign, lowercased and limited to safe characters, "" when missing. */
export function normalizeCampaign(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9_.-]/g, "").slice(0, 48);
}

/** Crawlers and link-preview bots shouldn't count as visits. */
export function isBotUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return true;
  return /bot|crawl|spider|slurp|preview|facebookexternalhit|whatsapp|headless|lighthouse|curl|wget|python-requests/i.test(userAgent);
}
