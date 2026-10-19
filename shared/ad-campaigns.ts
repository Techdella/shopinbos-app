// Ad campaigns (/home/ads/new): several products in one campaign, an audience, budget and dates, and the ads
// (a photo or a video per product, with words and a button). A campaign runs one of three ways:
//   * "meta":    through the seller's own Meta ad account (Facebook & Instagram) with the Marketing API;
//   * "managed": the Shopinbos team sets it up on TikTok or Meta after the seller pays the setup fee;
//   * "manual":  the seller boosts it themselves with our tracking links (the older one-product ads).
// Pure (zod only): the API routes, Peggy's tools and tests/behaviour.test.mjs share it.

import { z } from "zod";

export const CAMPAIGN_MODES = ["meta", "managed", "manual"] as const;
export type CampaignMode = (typeof CAMPAIGN_MODES)[number];

/** Where a managed campaign runs. */
export const MANAGED_PLATFORMS = ["tiktok", "meta"] as const;
export type ManagedPlatform = (typeof MANAGED_PLATFORMS)[number];

/** Setup fee (naira) the Shopinbos team charges to set up a campaign, by platform. Ad spend is separate. */
export const AD_SETUP_FEES: Record<ManagedPlatform, number> = { meta: 20_000, tiktok: 30_000 };

/** Paystack references for ad setup fees start with this (the webhook routes them here). */
export const AD_SETUP_REFERENCE_PREFIX = "adsetup-";

export const AD_OBJECTIVES = ["traffic", "whatsapp", "awareness"] as const;
export type AdObjective = (typeof AD_OBJECTIVES)[number];

export const AD_OBJECTIVE_INFO: Record<AdObjective, { label: string; hint: string }> = {
  traffic: { label: "Visits to my store", hint: "People tap through to your product pages and order." },
  whatsapp: { label: "WhatsApp chats", hint: "People tap to chat with you on WhatsApp, then buy." },
  awareness: { label: "Get seen", hint: "Show your products to as many people as possible." },
};

/** Meta call-to-action buttons that suit a small shop's link ads. */
export const AD_CTAS = ["SHOP_NOW", "ORDER_NOW", "BUY_NOW", "LEARN_MORE", "CONTACT_US", "GET_OFFER"] as const;
export type AdCta = (typeof AD_CTAS)[number];
export const AD_CTA_LABEL: Record<AdCta, string> = {
  SHOP_NOW: "Shop now",
  ORDER_NOW: "Order now",
  BUY_NOW: "Buy now",
  LEARN_MORE: "Learn more",
  CONTACT_US: "Contact us",
  GET_OFFER: "Get offer",
};

/** Nigeria's 36 states and the FCT, for location targeting. */
export const NG_STATES = [
  "Abia", "Adamawa", "Akwa Ibom", "Anambra", "Bauchi", "Bayelsa", "Benue", "Borno", "Cross River", "Delta", "Ebonyi", "Edo", "Ekiti", "Enugu",
  "Federal Capital Territory", "Gombe", "Imo", "Jigawa", "Kaduna", "Kano", "Katsina", "Kebbi", "Kogi", "Kwara", "Lagos", "Nasarawa", "Niger",
  "Ogun", "Ondo", "Osun", "Oyo", "Plateau", "Rivers", "Sokoto", "Taraba", "Yobe", "Zamfara",
] as const;

/** Countries sellers commonly ship to (ISO codes Meta uses). */
export const AD_COUNTRIES = [
  { code: "NG", name: "Nigeria" },
  { code: "GH", name: "Ghana" },
  { code: "KE", name: "Kenya" },
  { code: "ZA", name: "South Africa" },
  { code: "GB", name: "United Kingdom" },
  { code: "US", name: "United States" },
  { code: "CA", name: "Canada" },
] as const;

/** NGN is the default; the live naira minimum is "ads.min_daily_budget" in Admin › Pricing. */
export const MIN_DAILY_BUDGET: Record<string, number> = { NGN: 1_000, USD: 1, GBP: 1, EUR: 1 };
/** The lowest naira minimum an admin can set (shared/platform-pricing.ts). */
export const NGN_BUDGET_FLOOR = 100;

const text = (max: number) => z.string().trim().max(max);

export const AudienceSchema = z.object({
  countries: z.array(z.string().trim().length(2).toUpperCase()).min(1, "Pick at least one country").max(10).default(["NG"]),
  /** Nigerian states (empty = the whole country). */
  states: z.array(z.enum(NG_STATES)).max(37).default([]),
  ageMin: z.number().int().min(18).max(65).default(18),
  ageMax: z.number().int().min(18).max(65).default(55),
  gender: z.enum(["all", "women", "men"]).default("all"),
  /** Plain words ("fashion", "skincare"); matched to Meta interests at launch. */
  interests: z.array(text(60).min(1)).max(10).default([]),
});
export type AdAudience = z.infer<typeof AudienceSchema>;

export const CreativeSchema = z.object({
  productId: z.string().max(64).nullable(),
  kind: z.enum(["image", "video"]),
  mediaUrl: z.string().trim().max(2000).regex(/^https:\/\//, "Use a picture or video saved in your shop"),
  /** A cover picture for videos. */
  thumbUrl: z.string().trim().max(2000).nullable().optional(),
  videoProjectId: z.string().max(64).nullable().optional(),
  headline: text(80).min(1, "Add a headline"),
  primaryText: text(500).min(1, "Add the ad text"),
  cta: z.enum(AD_CTAS).default("SHOP_NOW"),
});
export type AdCreative = z.infer<typeof CreativeSchema>;

export const CampaignInputSchema = z
  .object({
    name: text(120).min(1, "Name the campaign"),
    mode: z.enum(CAMPAIGN_MODES),
    /** For managed campaigns: where the team runs it. Meta campaigns are always "meta". */
    platform: z.enum(["meta", "tiktok", "instagram", "facebook", "whatsapp_status"]).default("meta"),
    objective: z.enum(AD_OBJECTIVES).default("traffic"),
    productIds: z.array(z.string().max(64)).min(1, "Pick at least one product").max(20),
    audience: AudienceSchema,
    creatives: z.array(CreativeSchema).min(1, "Add at least one ad").max(20),
    dailyBudget: z.number().positive().max(100_000_000),
    currency: z.string().trim().length(3).toUpperCase().default("NGN"),
    startAt: z.string().datetime({ offset: true }).or(z.string().regex(/^\d{4}-\d{2}-\d{2}$/)),
    days: z.number().int().min(1).max(90),
  })
  .superRefine((value, ctx) => {
    // Naira: only the lowest minimum Admin › Pricing allows; saveCampaignDraft checks the live one.
    const min = value.currency === "NGN" ? NGN_BUDGET_FLOOR : MIN_DAILY_BUDGET[value.currency] ?? 1;
    if (value.dailyBudget < min) ctx.addIssue({ code: "custom", path: ["dailyBudget"], message: `The smallest daily budget is ${value.currency === "NGN" ? `₦${min.toLocaleString("en-NG")}` : `${min} ${value.currency}`}` });
    if (value.audience.ageMin > value.audience.ageMax) ctx.addIssue({ code: "custom", path: ["audience", "ageMax"], message: "The oldest age must be above the youngest" });
  });
export type CampaignInput = z.infer<typeof CampaignInputSchema>;

/** Start and end of a campaign from its start date and length (start in the past → now). */
export function campaignWindow(startAt: string, days: number, now = new Date()) {
  const parsed = new Date(/^\d{4}-\d{2}-\d{2}$/.test(startAt) ? `${startAt}T06:00:00+01:00` : startAt);
  const start = Number.isNaN(parsed.getTime()) || parsed < now ? now : parsed;
  const end = new Date(start.getTime() + Math.max(1, days) * 24 * 60 * 60 * 1000);
  return { start, end };
}

/** What the campaign costs if it spends its full budget (the platform charges this; not Shopinbos). */
export function campaignTotal(dailyBudget: number, days: number) {
  return Math.round(dailyBudget * Math.max(1, days) * 100) / 100;
}

// ─── Meta Marketing API bodies ─────────────────────────────────────────────────

/** ODAX objective, optimisation goal and billing event for each goal. WhatsApp goes through our tracking link. */
export function metaObjective(objective: AdObjective) {
  if (objective === "awareness") return { objective: "OUTCOME_AWARENESS", optimization_goal: "REACH", billing_event: "IMPRESSIONS" };
  return { objective: "OUTCOME_TRAFFIC", optimization_goal: "LINK_CLICKS", billing_event: "IMPRESSIONS" };
}

/** Meta budgets are in the account currency's smallest unit (kobo, cents). */
export function minorUnits(amount: number) {
  return Math.round(amount * 100);
}

export function metaCampaignBody(input: { name: string; objective: AdObjective }) {
  return {
    name: input.name.slice(0, 200),
    objective: metaObjective(input.objective).objective,
    status: "PAUSED",
    special_ad_categories: [],
    buying_type: "AUCTION",
  };
}

export interface ResolvedTargeting {
  /** Meta region keys for the chosen Nigerian states. */
  regions: Array<{ key: string }>;
  /** Meta interest ids for the seller's words. */
  interests: Array<{ id: string; name: string }>;
}

export function metaTargeting(audience: AdAudience, resolved: ResolvedTargeting) {
  const geo: Record<string, unknown> = {};
  // States narrow Nigeria; other countries stay whole.
  const otherCountries = audience.countries.filter((code) => code !== "NG" || !resolved.regions.length);
  if (otherCountries.length) geo.countries = otherCountries;
  if (resolved.regions.length) geo.regions = resolved.regions.map((region) => ({ key: region.key }));
  return {
    geo_locations: geo,
    age_min: audience.ageMin,
    age_max: audience.ageMax,
    ...(audience.gender === "men" ? { genders: [1] } : audience.gender === "women" ? { genders: [2] } : {}),
    ...(resolved.interests.length ? { flexible_spec: [{ interests: resolved.interests.map((interest) => ({ id: interest.id, name: interest.name })) }] } : {}),
    publisher_platforms: ["facebook", "instagram"],
  };
}

export function metaAdSetBody(input: { name: string; campaignId: string; objective: AdObjective; dailyBudget: number; start: Date; end: Date; targeting: ReturnType<typeof metaTargeting> }) {
  const goal = metaObjective(input.objective);
  return {
    name: input.name.slice(0, 200),
    campaign_id: input.campaignId,
    daily_budget: minorUnits(input.dailyBudget),
    billing_event: goal.billing_event,
    optimization_goal: goal.optimization_goal,
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    destination_type: input.objective === "awareness" ? undefined : "WEBSITE",
    start_time: input.start.toISOString(),
    end_time: input.end.toISOString(),
    targeting: input.targeting,
    status: "PAUSED",
  };
}

/** The ad's story: a link ad with a picture, or a video ad, with the seller's Page as the advertiser. */
export function metaCreativeBody(input: { name: string; pageId: string; instagramId?: string | null; link: string; creative: AdCreative; imageHash?: string | null; videoId?: string | null; description?: string | null }) {
  const cta = { type: input.creative.cta, value: { link: input.link } };
  const story: Record<string, unknown> = { page_id: input.pageId, ...(input.instagramId ? { instagram_user_id: input.instagramId } : {}) };
  if (input.videoId) {
    story.video_data = {
      video_id: input.videoId,
      ...(input.creative.thumbUrl ? { image_url: input.creative.thumbUrl } : {}),
      message: input.creative.primaryText,
      title: input.creative.headline,
      ...(input.description ? { link_description: input.description } : {}),
      call_to_action: cta,
    };
  } else {
    story.link_data = {
      link: input.link,
      message: input.creative.primaryText,
      name: input.creative.headline,
      ...(input.description ? { description: input.description } : {}),
      ...(input.imageHash ? { image_hash: input.imageHash } : { picture: input.creative.mediaUrl }),
      call_to_action: cta,
    };
  }
  return { name: input.name.slice(0, 200), object_story_spec: story };
}

/** Campaign status from Meta's effective status. */
export function statusFromMeta(effective: string | null | undefined): "running" | "paused" | "ended" | "draft" {
  const value = (effective ?? "").toUpperCase();
  if (value === "ACTIVE") return "running";
  if (value === "PAUSED" || value === "CAMPAIGN_PAUSED" || value === "ADSET_PAUSED" || value === "IN_PROCESS" || value === "WITH_ISSUES") return "paused";
  if (value === "DELETED" || value === "ARCHIVED" || value === "COMPLETED") return "ended";
  return "draft";
}

/** Totals from Meta insights rows (spend in account currency, as strings). */
export function readInsights(rows: Array<Record<string, unknown>> | null | undefined) {
  const row = rows?.[0] ?? {};
  const num = (value: unknown) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };
  return { spend: num(row.spend), impressions: Math.round(num(row.impressions)), reach: Math.round(num(row.reach)), clicks: Math.round(num(row.inline_link_clicks ?? row.clicks)) };
}

// ─── Managed requests ──────────────────────────────────────────────────────────

export const AD_REQUEST_STATUSES = ["awaiting_payment", "new", "in_progress", "live", "done", "cancelled"] as const;
export type AdRequestStatus = (typeof AD_REQUEST_STATUSES)[number];

export const AD_REQUEST_STATUS_LABEL: Record<AdRequestStatus, string> = {
  awaiting_payment: "Waiting for the setup fee",
  new: "Paid, waiting for the team",
  in_progress: "The team is setting it up",
  live: "Your ads are live",
  done: "Finished",
  cancelled: "Cancelled",
};

const phone = z.string().trim().min(7, "Add a phone number").max(30);

export const AdRequestSchema = z.object({
  platform: z.enum(MANAGED_PLATFORMS),
  campaignId: z.string().max(64).nullable().optional(),
  contactName: text(120).min(2, "Add your name"),
  contactPhone: phone,
  contactEmail: z.string().trim().email("Check the email").max(200).nullable().optional(),
  businessName: text(160).min(1, "Add the business name"),
  handle: text(120).nullable().optional(),
  pageUrl: text(300).nullable().optional(),
  website: text(300).nullable().optional(),
  adAccountId: text(80).nullable().optional(),
  dailyBudget: z.number().min(0).max(100_000_000).default(0),
  days: z.number().int().min(1).max(90).default(7),
  goals: text(1000).nullable().optional(),
  audience: text(1000).nullable().optional(),
  notes: text(2000).nullable().optional(),
});
export type AdRequestInput = z.infer<typeof AdRequestSchema>;
