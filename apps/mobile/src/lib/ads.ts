import * as WebBrowser from "expo-web-browser";
import { makeRedirectUri } from "expo-auth-session";
import { api } from "./api";
import { signedInUrl } from "./web";
import { payInApp } from "./pay";
import type { AdObjective, AdProduct, CampaignAction, CampaignRow, MetaStatus } from "./ads-pure";

/**
 * "Connect Meta ads": Facebook's sign-in in an in-app browser (/api/app/ads/meta/connect?app=…), which comes back to
 * shopinbos://ads?meta=<result>. The caller reloads either way ("connected", "needs_account", "cancelled"…).
 */
export async function connectMetaAds(): Promise<string | null> {
  const returnUrl = makeRedirectUri({ scheme: "shopinbos", path: "ads" });
  const url = await signedInUrl(`/api/app/ads/meta/connect?app=${encodeURIComponent(returnUrl)}`);
  const result = await WebBrowser.openAuthSessionAsync(url, returnUrl).catch(() => null);
  if (result?.type !== "success") return null;
  return new URLSearchParams(result.url.split("?")[1] ?? "").get("meta");
}

// Ads (web /home/ads and /home/ads/new): GET /api/mobile/ads for everything on the screens; drafts through
// POST /api/app/ads/campaigns, launch/pause/resume/sync/end through POST /api/app/ads/campaigns/:id, delete
// through DELETE; Peggy's words from POST /api/app/ads/copy; the team request and its setup fee through
// POST /api/app/ads/requests (Paystack opens in the browser). "Boost it yourself" ads change with PATCH /api/app/ads/:id.

export interface BoostRow {
  id: string;
  platform: string;
  destination: string;
  headline: string;
  primaryText: string;
  image: string | null;
  productName: string | null;
  dailyBudget: number;
  days: number;
  status: string;
  link: string;
  day: number;
  stats: { spend: number; clicks: number; orders: number; revenue: number };
}

export interface AdRequestRow {
  id: string;
  platform: string;
  status: string;
  businessName: string;
  setupFee: number;
  createdAt: string;
  paid: boolean;
  campaignId: string | null;
}

export interface AdsOverview {
  meta: MetaStatus;
  campaigns: CampaignRow[];
  boosts: BoostRow[];
  requests: AdRequestRow[];
  products: AdProduct[];
  hasWhatsapp: boolean;
  /** Live setup fees and naira minimum (missing from older servers: the built-in numbers apply). */
  prices?: AdPrices;
  contact: { name: string; phone: string; email: string; businessName: string; website: string };
}

export interface AdPrices {
  setup: { meta: number; tiktok: number };
  minDailyNgn: number;
}

export const fetchAds = () => api<AdsOverview>("/api/mobile/ads");

export function campaignAction(id: string, action: CampaignAction) {
  const path = `/api/app/ads/campaigns/${encodeURIComponent(id)}`;
  return action === "delete" ? api<{ id: string }>(path, { method: "DELETE" }) : api<unknown>(path, { method: "POST", json: { action } });
}

export const saveCampaignDraft = (body: unknown) => api<{ id: string }>("/api/app/ads/campaigns", { method: "POST", json: body });

export const writeAdCopy = (productIds: string[], objective: AdObjective) =>
  api<{ productId: string; headline: string; primaryText: string }[]>("/api/app/ads/copy", { method: "POST", json: { productIds, objective } });

/** The team request and its setup fee: Paystack in an in-app browser that comes back by itself (lib/pay.ts). */
export const sendAdRequest = (body: object) =>
  payInApp((app) => api<{ id: string; reference?: string; authorizationUrl: string }>("/api/app/ads/requests", { method: "POST", json: { ...body, app } }));

export interface MetaChoice {
  id: string;
  name: string;
  currency?: string;
}

/** The ad accounts and Facebook Pages on the connected login (GET /api/app/ads/meta?choices=1). */
export const fetchMetaChoices = () => api<MetaStatus & { choices: { accounts: MetaChoice[]; pages: MetaChoice[] } }>("/api/app/ads/meta?choices=1");
export const chooseMeta = (accountId: string, pageId: string) => api<MetaStatus>("/api/app/ads/meta", { method: "PATCH", json: { accountId, pageId } });
export const disconnectMeta = () => api<{ disconnected: boolean }>("/api/app/ads/meta", { method: "DELETE" });

export const setBoostStatus = (id: string, status: "running" | "paused" | "ended") => api<unknown>(`/api/app/ads/${encodeURIComponent(id)}`, { method: "PATCH", json: { status } });
