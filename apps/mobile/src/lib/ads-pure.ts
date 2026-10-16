// Ads on the phone (app/ads): the rules the screens share, without React Native so tests can load them.
// The lists below are copies of shared/ad-campaigns.ts (which needs zod, not in the app); tests/mobile-ads.test.mjs
// checks they stay the same as the web's.

export const AD_OBJECTIVES = ["traffic", "whatsapp", "awareness"] as const;
export type AdObjective = (typeof AD_OBJECTIVES)[number];

export const AD_CTAS = ["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "LEARN_MORE", "CONTACT_US", "GET_OFFER"] as const;
export type AdCta = (typeof AD_CTAS)[number];

/** Setup fee (naira) the Shopinbos team charges, by platform. Ad spend is separate. */
export const AD_SETUP_FEES = { meta: 20_000, tiktok: 30_000 } as const;
export const MIN_DAILY_BUDGET: Record<string, number> = { NGN: 1_000, USD: 1, GBP: 1, EUR: 1 };

export const AD_COUNTRIES = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
] as const;

export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger",
  "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

export const BUDGET_CHOICES: Record<string, number[]> = { NGN: [2000, 5000, 10000, 20000], other: [5, 10, 20, 50] };
export const DAY_CHOICES = [3, 7, 14, 30] as const;

/** How a new campaign runs: the seller's own Meta ad account, or the Shopinbos team on Meta or TikTok. */
export type AdMode = "meta" | "managed_meta" | "managed_tiktok";

export type MetaConnection = "off" | "connected" | "needs_account" | "reauth";

export interface MetaStatus {
  configured: boolean;
  status: MetaConnection;
  accountId: string | null;
  accountName: string | null;
  pageName: string | null;
  currency: string;
}

export interface AdAudience {
  countries: string[];
  states: string[];
  ageMin: number;
  ageMax: number;
  gender: "all" | "women" | "men";
  interests: string[];
}

export interface AdCreative {
  productId: string | null;
  kind: "image" | "video";
  mediaUrl: string;
  thumbUrl: string | null;
  videoProjectId: string | null;
  headline: string;
  primaryText: string;
  cta: AdCta;
}

export interface AdProduct {
  id: string;
  name: string;
  price: number;
  image: string | null;
}

export interface CampaignStats {
  spend: number;
  clicks: number;
  impressions: number;
  reach: number;
  orders: number;
  revenue: number;
}

export interface CampaignRow {
  id: string;
  name: string;
  mode: string;
  platform: string;
  status: string;
  objective: string | null;
  products: number;
  ads: number;
  image: string | null;
  words: { headline: string; primaryText: string }[];
  dailyBudget: number;
  currency: string;
  days: number;
  startAt: string | null;
  endAt: string | null;
  stats: CampaignStats;
  syncError: string | null;
  lastSyncAt: string | null;
  request: { status: string } | null;
}

export type CampaignAction = "launch" | "pause" | "resume" | "sync" | "end" | "delete";

/**
 * The buttons a campaign shows, as on the web: Meta campaigns launch (draft), pause (running) or resume (paused),
 * and refresh their numbers once started. Any running or paused campaign can end; anything not running can go.
 */
export function campaignActions(campaign: Pick<CampaignRow, "mode" | "status">): CampaignAction[] {
  const actions: CampaignAction[] = [];
  if (campaign.mode === "meta") {
    if (campaign.status === "draft") actions.push("launch");
    if (campaign.status === "running") actions.push("pause");
    if (campaign.status === "paused") actions.push("resume");
    if (campaign.status !== "draft") actions.push("sync");
  }
  if (campaign.status === "running" || campaign.status === "paused") actions.push("end");
  if (campaign.status !== "running") actions.push("delete");
  return actions;
}

/** Ad spend per order, or null before the first order. */
export function costPerOrder(stats: Pick<CampaignStats, "spend" | "orders">) {
  return stats.orders > 0 ? stats.spend / stats.orders : null;
}

/** What the campaign costs if it spends its full budget (paid to the platform, not Shopinbos). */
export function campaignTotal(dailyBudget: number, days: number) {
  return Math.round(dailyBudget * Math.max(1, days) * 100) / 100;
}

export function modeFee(mode: AdMode) {
  return mode === "meta" ? 0 : mode === "managed_tiktok" ? AD_SETUP_FEES.tiktok : AD_SETUP_FEES.meta;
}

/** The mode a new campaign starts on: the seller's own Meta account when it's connected, else the team. */
export function defaultMode(meta: Pick<MetaStatus, "configured" | "status">): AdMode {
  return meta.configured && meta.status === "connected" ? "meta" : "managed_meta";
}

export function minBudget(currency: string) {
  return MIN_DAILY_BUDGET[currency] ?? 1;
}

export const WIZARD_STEPS = ["how", "products", "audience", "budget", "ads", "review"] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export interface WizardState {
  mode: AdMode;
  meta: Pick<MetaStatus, "status">;
  productIds: string[];
  audience: AdAudience;
  dailyBudget: number;
  currency: string;
  days: number;
  creatives: AdCreative[];
}

/** Whether "Next" works on a step (the web wizard's rules). */
export function canGoOn(step: WizardStep, state: WizardState) {
  switch (step) {
    case "how":
      return state.mode !== "meta" || state.meta.status === "connected";
    case "products":
      return state.productIds.length > 0;
    case "audience":
      return state.audience.countries.length > 0 && state.audience.ageMin <= state.audience.ageMax;
    case "budget":
      return state.dailyBudget >= minBudget(state.currency) && state.days >= 1;
    case "ads":
      return state.creatives.length > 0 && state.creatives.every((creative) => creative.headline.trim() && creative.primaryText.trim());
    default:
      return true;
  }
}

/** A photo ad per chosen product (headline "Name · ₦price"); ads for products taken out go, others keep their words. */
export function syncCreatives(current: AdCreative[], products: AdProduct[], productIds: string[], objective: AdObjective, money: (n: number) => string): AdCreative[] {
  const kept = current.filter((creative) => creative.kind === "video" || (creative.productId && productIds.includes(creative.productId)));
  const missing = productIds
    .map((id) => products.find((product) => product.id === id))
    .filter((product): product is AdProduct => Boolean(product?.image) && !kept.some((creative) => creative.productId === product!.id));
  return [
    ...kept,
    ...missing.map((product): AdCreative => ({
      productId: product.id,
      kind: "image",
      mediaUrl: product.image!,
      thumbUrl: null,
      videoProjectId: null,
      headline: `${product.name} · ${money(product.price)}`.slice(0, 80),
      primaryText: "",
      cta: objective === "whatsapp" ? "CONTACT_US" : "SHOP_NOW",
    })),
  ];
}

/** Peggy's words ({ productId, headline, primaryText } per product) put into the matching ads. */
export function applyCopy(creatives: AdCreative[], copy: { productId: string; headline: string; primaryText: string }[]): AdCreative[] {
  return creatives.map((creative) => {
    const match = copy.find((item) => item.productId === creative.productId) ?? (creative.kind === "video" ? copy[0] : null);
    return match ? { ...creative, headline: match.headline.slice(0, 80), primaryText: match.primaryText.slice(0, 500) } : creative;
  });
}

/** The body for POST /api/app/ads/campaigns (a draft), as the web wizard sends it. */
export function campaignBody(input: { name: string; mode: AdMode; objective: AdObjective; productIds: string[]; audience: AdAudience; creatives: AdCreative[]; dailyBudget: number; currency: string; startAt: string; days: number }) {
  return {
    name: input.name.trim().slice(0, 120),
    mode: input.mode === "meta" ? "meta" : "managed",
    platform: input.mode === "managed_tiktok" ? "tiktok" : "meta",
    objective: input.objective,
    productIds: input.productIds,
    audience: input.audience,
    creatives: input.creatives.map((creative) => ({ ...creative, headline: creative.headline.trim(), primaryText: creative.primaryText.trim() })),
    dailyBudget: input.dailyBudget,
    currency: input.mode === "meta" ? input.currency : "NGN",
    startAt: input.startAt,
    days: input.days,
  };
}

/** Where and who, in English for the team ("Lagos, Oyo · women 18-45 · into fashion"), like the web. */
export function describeAudience(audience: AdAudience) {
  const where = audience.states.length
    ? audience.states.map((state) => (state === "Federal Capital Territory" ? "Abuja" : state)).join(", ")
    : audience.countries.map((code) => AD_COUNTRIES.find((country) => country.code === code)?.name ?? code).join(", ");
  const who = audience.gender === "all" ? "everyone" : audience.gender;
  return `${where} · ${who} ${audience.ageMin}-${audience.ageMax}${audience.interests.length ? ` · into ${audience.interests.join(", ")}` : ""}`;
}

export interface TeamDetails {
  name: string;
  phone: string;
  email: string;
  businessName: string;
  handle: string;
  pageUrl: string;
  website: string;
  goals: string;
}

const OBJECTIVE_LABEL: Record<AdObjective, string> = { traffic: "Visits to my store", whatsapp: "WhatsApp chats", awareness: "Get seen" };

/** The body for POST /api/app/ads/requests (the Shopinbos team runs it), as the web wizard sends it. */
export function requestBody(campaignId: string, mode: AdMode, objective: AdObjective, audience: AdAudience, dailyBudget: number, days: number, details: TeamDetails) {
  const clean = (value: string) => value.trim() || null;
  return {
    platform: mode === "managed_tiktok" ? "tiktok" : "meta",
    campaignId,
    contactName: details.name.trim(),
    contactPhone: details.phone.trim(),
    contactEmail: clean(details.email),
    businessName: details.businessName.trim(),
    handle: clean(details.handle),
    pageUrl: clean(details.pageUrl),
    website: clean(details.website),
    adAccountId: null,
    dailyBudget,
    days,
    goals: [OBJECTIVE_LABEL[objective], details.goals.trim()].filter(Boolean).join(". "),
    audience: describeAudience(audience),
    notes: null,
  };
}

/** The details the team needs before the fee can be paid (name, phone, business; a TikTok handle for TikTok). */
export function detailsReady(mode: AdMode, details: TeamDetails) {
  return details.name.trim().length >= 2 && details.phone.trim().length >= 7 && Boolean(details.businessName.trim()) && (mode !== "managed_tiktok" || Boolean(details.handle.trim()));
}

/** "2026-10-19": today in Lagos, the first day a campaign can start. */
export function lagosToday(now = Date.now()) {
  return new Date(now + 60 * 60_000).toISOString().slice(0, 10);
}

/** 12345 → "12,345" (whole numbers, the way the web shows counts). */
export function groupDigits(value: number) {
  const whole = Math.round(Number(value) || 0);
  return `${whole < 0 ? "-" : ""}${String(Math.abs(whole)).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

/** Lagos date `days` after today. */
export function lagosDayFrom(days: number, now = Date.now()) {
  return new Date(now + 60 * 60_000 + days * 86_400_000).toISOString().slice(0, 10);
}
