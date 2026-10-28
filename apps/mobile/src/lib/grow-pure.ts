// The seller's "grow" screens on the phone (canvas row "Seller app · sell, grow"): the Menu's live counts, Insights,
// Email and Popups. No imports, so tests/mobile-grow.test.mjs runs this file directly in Node.

// ─── Menu (board M-Menu) ─────────────────────────────────────────────────────

/** Ads running right now: the Menu's "1 LIVE" on Ads. */
export function liveAds(overview: { campaigns: { status: string }[]; boosts: { status: string }[] } | null | undefined): number {
  if (!overview) return 0;
  return [...overview.campaigns, ...overview.boosts].filter((ad) => ad.status === "running").length;
}

/** The numbers across every ad (board M-Ads' top card): naira spent, people reached and orders. Campaigns billed in
 * another currency count for reach and orders but not for the naira spent. */
export function adsTotals(overview: {
  campaigns: { currency: string; stats: { spend: number; reach: number; orders: number } }[];
  boosts: { stats: { spend: number; orders: number } }[];
} | null | undefined): { spend: number; reach: number; orders: number } {
  if (!overview) return { spend: 0, reach: 0, orders: 0 };
  const spend = overview.campaigns.filter((campaign) => campaign.currency === "NGN").reduce((sum, campaign) => sum + campaign.stats.spend, 0) + overview.boosts.reduce((sum, ad) => sum + ad.stats.spend, 0);
  const reach = overview.campaigns.reduce((sum, campaign) => sum + campaign.stats.reach, 0);
  const orders = overview.campaigns.reduce((sum, campaign) => sum + campaign.stats.orders, 0) + overview.boosts.reduce((sum, ad) => sum + ad.stats.orders, 0);
  return { spend: Math.round(spend), reach, orders };
}

/** Automations switched on: the Menu's "3 ON" on Automations. */
export function automationsOn(overview: { flows: { active: boolean }[] } | null | undefined): number {
  return overview ? overview.flows.filter((flow) => flow.active).length : 0;
}

/** Tools whose name or words match what the seller typed in the Menu's search (case and accents ignored). */
export function matchTools<T extends { words: string[] }>(tools: T[], query: string): T[] {
  const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const q = fold(query.trim());
  if (!q) return tools;
  return tools.filter((tool) => tool.words.some((word) => fold(word).includes(q)));
}

// ─── Insights (board M-Insights) ─────────────────────────────────────────────

export const INSIGHT_RANGES = ["today", "7d", "30d"] as const;
export type InsightRange = (typeof INSIGHT_RANGES)[number];

export interface InsightNumber {
  value: number;
  change: number | null;
  diff: number;
}

export interface Insights {
  range: string;
  visitsCounted: boolean;
  sales: InsightNumber;
  orders: InsightNumber;
  visits: InsightNumber;
  conversion: { value: number | null; previous: number | null };
  sources: Array<{ key: string; label: string; visits: number; share: number }>;
  bestSellers: Array<{ key: string; productId: string | null; name: string; image: string | null; quantity: number; sales: number }>;
}

/** "1.5%" for a share between 0 and 1 (one decimal under 10%, whole numbers above). */
export function percent(share: number | null | undefined): string {
  if (share == null || !Number.isFinite(share)) return "–";
  const value = share * 100;
  const rounded = value < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded}%`;
}

/** Which way a number moved against the period before: up, down, same, or nothing to compare. */
export function trend(diff: number, previousKnown = true): "up" | "down" | "same" | "none" {
  if (!previousKnown) return "none";
  return diff > 0 ? "up" : diff < 0 ? "down" : "same";
}

/** The conversion line: up or down by how many points, or the same. */
export function conversionTrend(conversion: Insights["conversion"]): "up" | "down" | "same" | "none" {
  if (conversion.value == null || conversion.previous == null) return "none";
  const diff = Math.round((conversion.value - conversion.previous) * 1000);
  return diff > 0 ? "up" : diff < 0 ? "down" : "same";
}

// ─── Email (boards M-Email, M-EmailCreate) ───────────────────────────────────

export const EMAIL_TABS = ["sent", "scheduled", "drafts"] as const;
export type EmailTab = (typeof EMAIL_TABS)[number];

/** Which tab a campaign shows under. Sending counts as sent; cancelled ones sit with the drafts. */
export function emailTab(status: string): EmailTab {
  if (status === "sent" || status === "sending") return "sent";
  if (status === "scheduled") return "scheduled";
  return "drafts";
}

/** Average opened share across sent email campaigns (opens / sent), null before anything was sent. */
export function openedShare(campaigns: { channel: string; status: string; sentCount: number; openCount: number }[]): number | null {
  const sent = campaigns.filter((campaign) => campaign.channel === "email" && campaign.status === "sent");
  const total = sent.reduce((sum, campaign) => sum + campaign.sentCount, 0);
  return total > 0 ? sent.reduce((sum, campaign) => sum + campaign.openCount, 0) / total : null;
}

/** Who a new email goes to (the campaign API's AudienceSchema). */
export const EMAIL_AUDIENCES = {
  everyone: { mode: "all" },
  subscribers: { mode: "subscribers" },
  repeat: { mode: "min_orders", value: 2 },
} as const;
export type EmailAudience = keyof typeof EMAIL_AUDIENCES;

/** A short campaign name from the subject ("Fresh prints just landed, Chioma" → itself, cut at 120). */
export function campaignName(subject: string, fallback: string): string {
  const name = subject.replace(/\s+/g, " ").trim();
  return (name || fallback).slice(0, 120);
}

/** "2026-11-27T07:00" in Lagos time, `days` from now at `hour` o'clock: the schedule action reads it as Lagos time. */
export function lagosSlot(days: number, hour: number, now = Date.now()): string {
  const lagos = new Date(now + 60 * 60_000 + days * 86_400_000);
  return `${lagos.toISOString().slice(0, 10)}T${String(hour).padStart(2, "0")}:00`;
}

// ─── Popups (boards M-Popups, M-PopupEdit) ───────────────────────────────────

export interface PopupField {
  key: string;
  type: string;
  label: string;
  required: boolean;
  options?: string[];
}

export interface PopupConfigLike {
  trigger: "immediate" | "delay" | "exit_intent" | "scroll";
  delaySeconds: number;
  scrollPercent: number;
  kind: string;
  redirectUrl?: string;
  reward: { source: string; type: string; value: number; [key: string]: unknown } | null;
  [key: string]: unknown;
}

export interface PhonePopup {
  id: string;
  name: string;
  type: string;
  isPopup: boolean;
  active: boolean;
  fields: PopupField[];
  design: { headline: string; [key: string]: unknown };
  config: PopupConfigLike;
  views: number;
  signups: number;
  rewardText: string | null;
  /** A sign-up pop-up: the phone can change its offer and what it asks for. */
  signup: boolean;
}

/** When it shows, as the board's three choices (others keep what the web saved). */
export const POPUP_WHEN = ["delay", "exit_intent", "scroll"] as const;
export type PopupWhen = (typeof POPUP_WHEN)[number] | "immediate";

export function popupWhen(config: Pick<PopupConfigLike, "trigger">): PopupWhen {
  return config.trigger;
}

/** The config with a new "show it" choice: after 5 seconds, when leaving, or halfway down the page. */
export function withWhen<C extends PopupConfigLike>(config: C, when: (typeof POPUP_WHEN)[number]): C {
  if (when === "delay") return { ...config, trigger: "delay", delaySeconds: 5 };
  if (when === "scroll") return { ...config, trigger: "scroll", scrollPercent: 50 };
  return { ...config, trigger: "exit_intent" };
}

/** Whether it asks for a WhatsApp number (a phone field) besides the email every sign-up needs. */
export function asksWhatsapp(fields: PopupField[]): boolean {
  return fields.some((field) => field.type === "phone");
}

export function withWhatsapp(fields: PopupField[], on: boolean, label = "WhatsApp number"): PopupField[] {
  const rest = fields.filter((field) => field.type !== "phone");
  if (!on) return rest;
  const email = rest.findIndex((field) => field.type === "email");
  const phone = { key: "phone", type: "phone", label, required: false };
  return email >= 0 ? [...rest.slice(0, email + 1), phone, ...rest.slice(email + 1)] : [phone, ...rest];
}

/** The offer choices on the phone: no code, or a percent off made for each person. */
export const POPUP_OFFERS = [0, 5, 10, 15, 20] as const;

/** The % off a sign-up pop-up gives (0 = nothing, null = an offer the phone can't show, like ₦ off or an old code). */
export function popupOffer(config: Pick<PopupConfigLike, "reward">): number | null {
  const reward = config.reward;
  if (!reward) return 0;
  return reward.source === "new" && reward.type === "percentage" ? reward.value : null;
}

/** The config with a new offer: a fresh code per person for that % off (the web editor's defaults), or none. */
export function withOffer<C extends PopupConfigLike>(config: C, percentOff: number): C {
  if (!percentOff) return { ...config, reward: null };
  const base = config.reward && config.reward.source === "new" ? config.reward : { source: "new", type: "percentage", value: 10, days: 14, minOrder: 0, unique: true, discountId: null, code: "", prefix: "WELCOME" };
  return { ...config, reward: { ...base, type: "percentage", value: percentOff } };
}

/** The headline after the offer changes: "Get 10% off…" becomes "Get 15% off…" when it names the old offer; anything
 * else the seller wrote stays as it is. */
export function headlineForOffer(headline: string, from: number | null, to: number): string {
  if (!from || !to || from === to) return headline;
  const pattern = new RegExp(`(^|[^\\d])${from}%`);
  return pattern.test(headline) ? headline.replace(pattern, `$1${to}%`) : headline;
}

/** The body for POST /api/app/marketing/forms or PATCH /api/app/marketing/forms/:id (the server's FormSchema). */
export function popupBody(popup: Pick<PhonePopup, "name" | "type" | "isPopup" | "active" | "fields" | "design" | "config">) {
  const kind = popup.config.kind;
  return {
    name: popup.name,
    type: ["newsletter", "lead", "waitlist", "popup"].includes(popup.type) ? popup.type : "newsletter",
    isPopup: popup.isPopup,
    active: popup.active,
    fields: popup.fields,
    design: popup.design,
    popupConfig: { ...popup.config, redirectUrl: popup.config.redirectUrl || undefined, reward: kind === "signup" ? popup.config.reward : null },
  };
}

/** Signed up / seen, for the card ("8.7%"), or null before anyone saw it. */
export function signupRate(popup: Pick<PhonePopup, "views" | "signups">): string | null {
  return popup.views > 0 ? percent(popup.signups / popup.views) : null;
}
