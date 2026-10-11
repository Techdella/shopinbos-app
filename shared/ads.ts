// Ads: Peggy writes the ad and gives it a tracking link; the seller runs it on Instagram, Facebook or TikTok
// (paying the platform directly); Shopinbos counts taps and orders and says when to stop or add budget.
// Pure helpers, unit-tested.

import type { LinkChannel } from "./channels";

export const AD_PLATFORMS = [
  { key: "instagram", label: "Instagram", channel: "instagram", ref: "ig" },
  { key: "facebook", label: "Facebook", channel: "facebook", ref: "fb" },
  { key: "tiktok", label: "TikTok", channel: "tiktok", ref: "tt" },
  { key: "whatsapp_status", label: "WhatsApp status", channel: "whatsapp", ref: "wa" },
] as const satisfies ReadonlyArray<{ key: string; label: string; channel: LinkChannel; ref: string }>;
export type AdPlatform = (typeof AD_PLATFORMS)[number]["key"];
export const AD_PLATFORM_KEYS = ["instagram", "facebook", "tiktok", "whatsapp_status"] as const satisfies readonly AdPlatform[];

export const AD_DESTINATIONS = [
  { key: "whatsapp", label: "WhatsApp chat", hint: "Buyers message you; best for questions and pay on delivery." },
  { key: "store", label: "Product page", hint: "Buyers order and pay on your store." },
] as const;
export type AdDestination = (typeof AD_DESTINATIONS)[number]["key"];

export const AD_BUDGETS = [2000, 5000, 10000] as const;
export const AD_STATUSES = ["draft", "running", "paused", "ended"] as const;
export type AdStatus = (typeof AD_STATUSES)[number];

/** Day after which an ad with no orders should be paused. */
export const STOP_RULE_DAYS = 2;

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";

/** Short code for the /r/ad/<code> tracking link. */
export function adCode(random: () => number = Math.random) {
  return Array.from({ length: 7 }, () => ALPHABET[Math.floor(random() * ALPHABET.length)]).join("");
}

export function fallbackAdCopy(product: string, price: string, destination: AdDestination) {
  return {
    headline: `${product}${price ? ` · ${price}` : ""}`.slice(0, 60),
    primaryText:
      destination === "whatsapp"
        ? `${product} is back in stock${price ? ` at ${price}` : ""}. Delivered in Lagos and across Nigeria, pay on delivery available. Send us a WhatsApp message to order yours.`
        : `${product}${price ? `, ${price}` : ""}. Order on our store in a minute and we deliver to your door.`,
  };
}

export interface AdStats {
  status: string;
  startedAt: Date | string | null;
  days: number;
  dailyBudget: number;
  spend: number;
  clicks: number;
  orders: number;
  revenue: number;
}

export function plannedBudget(dailyBudget: number, days: number) {
  return Math.max(0, dailyBudget) * Math.max(0, days);
}

export function costPerOrder(stats: Pick<AdStats, "spend" | "orders">) {
  return stats.orders > 0 && stats.spend > 0 ? Math.round(stats.spend / stats.orders) : null;
}

export function daysRunning(startedAt: Date | string | null, now = new Date()) {
  if (!startedAt) return 0;
  return Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 86_400_000));
}

export type AdAdvice = { tone: "warning" | "success" | "muted"; text: string; action?: "pause" | "end" | "boost" } | null;

/** What Peggy says about a running ad. */
export function adAdvice(stats: AdStats, now = new Date()): AdAdvice {
  if (stats.status !== "running") return null;
  const days = daysRunning(stats.startedAt, now);
  if (days >= stats.days) return { tone: "muted", text: `The planned ${stats.days} days are up. End it, or keep it going if it's still selling.`, action: "end" };
  if (days >= STOP_RULE_DAYS && stats.orders === 0) {
    return { tone: "warning", text: `No orders after ${days} days${stats.clicks ? ` and ${stats.clicks} taps` : ""}. Pause it in the app you're running it on and try another photo.`, action: "pause" };
  }
  if (stats.orders > 0 && (stats.spend === 0 || stats.revenue >= stats.spend * 3)) {
    return { tone: "success", text: `It's selling: ${stats.orders} order${stats.orders === 1 ? "" : "s"}. Worth adding ₦2,000 a day until it slows down.`, action: "boost" };
  }
  return null;
}
