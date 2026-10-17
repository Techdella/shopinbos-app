import "server-only";

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { appOrigin, trackingUrl } from "@/lib/ads";
import { credentialKey, decryptJson, encryptJson } from "@/lib/inbox/crypto";
import { GRAPH_VERSION } from "@/lib/inbox/channels/types";
import {
  campaignWindow,
  metaAdSetBody,
  metaCampaignBody,
  metaCreativeBody,
  metaTargeting,
  readInsights,
  statusFromMeta,
  type AdAudience,
  type AdCreative,
  type AdObjective,
} from "@shared/ad-campaigns";

// Meta ads for a seller's own ad account (Facebook & Instagram), through the Marketing API:
//   * connect: Facebook Login (a Login for Business configuration in META_ADS_CONFIG_ID, or the classic scopes)
//     with ads_management, ads_read, business_management and the Page permissions; the seller then picks the ad
//     account and the Facebook Page the ads run as. Stored as SocialChannelConnection channel "meta_ads":
//     accountId = "act_…", externalId = Page id, tokenEnc = encrypted { token, instagramId? }.
//   * launch: campaign → ad set (audience, budget, dates) → one creative and ad per product or video, all created
//     paused, then the campaign is switched on. Ad spend is billed by Meta to the seller's ad account.
//   * sync: spend, impressions, reach and link clicks from insights; pause and resume.

const CHANNEL = "meta_ads";
const SCOPES = ["ads_management", "ads_read", "business_management", "pages_show_list", "pages_read_engagement", "pages_manage_ads", "instagram_basic"];
const STATE_MAX_AGE_MS = 15 * 60_000;

export class MetaAdsError extends Error {
  constructor(message: string, readonly reconnect = false) {
    super(message);
  }
}

export function metaAdsConfigured(env: Record<string, string | undefined> = process.env) {
  return Boolean(env.META_APP_ID?.trim() && env.META_APP_SECRET?.trim() && credentialKey(env));
}

const graphBase = () => `https://graph.facebook.com/${GRAPH_VERSION}`;
const redirectUri = () => `${appOrigin()}/api/app/ads/meta/callback`;

// ─── OAuth state (signed, fresh, this store, this browser) ─────────────────────

function sign(payload: string, key: Buffer) {
  return createHmac("sha256", key).update(`meta-ads-state:${payload}`).digest("base64url");
}

export function startMetaAdsConnect(storeId: string) {
  const key = credentialKey();
  if (!key || !metaAdsConfigured()) return null;
  const nonce = randomBytes(18).toString("base64url");
  const payload = Buffer.from(JSON.stringify({ s: storeId, n: nonce, t: Date.now() })).toString("base64url");
  const state = `${payload}.${sign(payload, key)}`;
  const params = new URLSearchParams({ client_id: process.env.META_APP_ID ?? "", redirect_uri: redirectUri(), state, response_type: "code" });
  const config = process.env.META_ADS_CONFIG_ID?.trim();
  if (config) {
    params.set("config_id", config);
    params.set("override_default_response_type", "true");
  } else params.set("scope", SCOPES.join(","));
  return { url: `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth?${params}`, nonce };
}

export function checkMetaAdsState(value: string | null, storeId: string, nonceCookie: string | null | undefined, now = Date.now()) {
  const key = credentialKey();
  if (!key || !value || !nonceCookie || value.length > 1000) return false;
  const [payload, sig] = value.split(".");
  if (!payload || !sig) return false;
  const expected = Buffer.from(sign(payload, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return false;
  try {
    const raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { s?: string; n?: string; t?: number };
    if (raw.s !== storeId || typeof raw.t !== "number" || now - raw.t > STATE_MAX_AGE_MS || raw.t > now + 60_000) return false;
    const a = Buffer.from(raw.n ?? "");
    const b = Buffer.from(nonceCookie);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const META_ADS_NONCE_COOKIE = "sib_meta_ads";

// ─── Graph calls ───────────────────────────────────────────────────────────────

async function graph<T = Record<string, unknown>>(path: string, token: string, init: { method?: "GET" | "POST" | "DELETE"; body?: Record<string, unknown>; query?: Record<string, string> } = {}): Promise<T> {
  const url = new URL(`${graphBase()}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
  const method = init.method ?? (init.body ? "POST" : "GET");
  let body: URLSearchParams | undefined;
  if (init.body) {
    body = new URLSearchParams();
    for (const [key, value] of Object.entries(init.body)) {
      if (value === undefined || value === null) continue;
      body.set(key, typeof value === "string" ? value : JSON.stringify(value));
    }
  }
  if (method === "GET") url.searchParams.set("access_token", token);
  else body = body ?? new URLSearchParams();
  if (body && method !== "GET") body.set("access_token", token);
  const response = await fetch(url, { method, body: method === "GET" ? undefined : body, signal: AbortSignal.timeout(30_000), cache: "no-store" }).catch(() => null);
  if (!response) throw new MetaAdsError("Couldn't reach Facebook. Try again in a moment.");
  const json = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok || json.error) {
    const error = (json.error ?? {}) as { message?: string; error_user_msg?: string; code?: number; type?: string };
    const reconnect = error.code === 190 || error.type === "OAuthException";
    throw new MetaAdsError(error.error_user_msg || error.message || `Facebook answered ${response.status}`, reconnect);
  }
  return json as T;
}

async function exchangeToken(params: Record<string, string>) {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const response = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
  const json = (response ? await response.json().catch(() => ({})) : {}) as { access_token?: string; expires_in?: number; error?: { message?: string } };
  if (!response?.ok || !json.access_token) throw new MetaAdsError(json.error?.message ?? "Facebook didn't accept the sign-in. Try again.", true);
  return { access_token: json.access_token, expires_in: json.expires_in };
}

interface StoredToken {
  token: string;
  instagramId?: string | null;
  accountName?: string | null;
  pageName?: string | null;
  currency?: string | null;
}

function findRow(storeId: string) {
  return db.socialChannelConnection.findUnique({ where: { storeId_channel: { storeId, channel: CHANNEL } } });
}

async function tokenFor(storeId: string) {
  const row = await findRow(storeId);
  const stored = decryptJson<StoredToken>(row?.tokenEnc);
  if (!row || !stored?.token) throw new MetaAdsError("Connect your Meta ad account first.", true);
  return { row, stored };
}

/** Facebook sent the seller back: keep a long-lived token and pick the ad account and Page when there's one of each. */
export async function finishMetaAdsConnect(storeId: string, code: string) {
  const app = { client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "" };
  const first = await exchangeToken({ ...app, redirect_uri: redirectUri(), code });
  const long = await exchangeToken({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: first.access_token }).catch(() => null);
  const token = long?.access_token ?? first.access_token;
  const expiresIn = long?.expires_in ?? first.expires_in;
  const { accounts, pages } = await listChoices(token);
  const account = accounts.length === 1 ? accounts[0] : null;
  const page = pages.length === 1 ? pages[0] : null;
  const stored: StoredToken = { token, instagramId: page?.instagramId ?? null, accountName: account?.name ?? null, pageName: page?.name ?? null, currency: account?.currency ?? null };
  const data = {
    tokenEnc: encryptJson(stored),
    status: account && page ? "connected" : "needs_account",
    accountId: account?.id ?? null,
    externalId: page?.id ?? null,
    tokenExpiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
    connectedAt: new Date(),
    lastSyncStatus: "ok",
    lastSyncMessage: null,
  };
  await db.socialChannelConnection.upsert({ where: { storeId_channel: { storeId, channel: CHANNEL } }, create: { storeId, channel: CHANNEL, ...data }, update: data });
  return data.status;
}

export interface MetaChoice {
  id: string;
  name: string;
  currency?: string;
  instagramId?: string | null;
}

async function listChoices(token: string) {
  const [accounts, pages] = await Promise.all([
    graph<{ data?: Array<{ id: string; name?: string; currency?: string; account_status?: number }> }>("me/adaccounts", token, { query: { fields: "id,name,currency,account_status", limit: "50" } }),
    graph<{ data?: Array<{ id: string; name?: string; instagram_business_account?: { id: string } }> }>("me/accounts", token, { query: { fields: "id,name,instagram_business_account", limit: "50" } }),
  ]);
  return {
    // 1 = active; closed or disabled accounts can't run ads.
    accounts: (accounts.data ?? []).filter((item) => item.account_status === undefined || item.account_status === 1).map((item): MetaChoice => ({ id: item.id, name: item.name ?? item.id, currency: item.currency })),
    pages: (pages.data ?? []).map((item): MetaChoice => ({ id: item.id, name: item.name ?? item.id, instagramId: item.instagram_business_account?.id ?? null })),
  };
}

export async function metaAdsChoices(storeId: string) {
  const { stored } = await tokenFor(storeId);
  return listChoices(stored.token);
}

export async function chooseMetaAds(storeId: string, accountId: string, pageId: string) {
  const { row, stored } = await tokenFor(storeId);
  const { accounts, pages } = await listChoices(stored.token);
  const account = accounts.find((item) => item.id === accountId);
  const page = pages.find((item) => item.id === pageId);
  if (!account || !page) throw new MetaAdsError("Pick an ad account and a Page from the list.");
  const next: StoredToken = { ...stored, instagramId: page.instagramId ?? null, accountName: account.name, pageName: page.name, currency: account.currency ?? null };
  await db.socialChannelConnection.update({ where: { id: row.id }, data: { accountId: account.id, externalId: page.id, status: "connected", tokenEnc: encryptJson(next) } });
}

export async function disconnectMetaAds(storeId: string) {
  await db.socialChannelConnection.deleteMany({ where: { storeId, channel: CHANNEL } });
}

export interface MetaAdsStatus {
  configured: boolean;
  status: "off" | "connected" | "needs_account" | "reauth";
  accountId: string | null;
  accountName: string | null;
  pageName: string | null;
  currency: string;
}

export async function metaAdsStatus(storeId: string): Promise<MetaAdsStatus> {
  const configured = metaAdsConfigured();
  const row = await findRow(storeId).catch(() => null);
  const stored = decryptJson<StoredToken>(row?.tokenEnc);
  if (!row || !stored?.token) return { configured, status: "off", accountId: null, accountName: null, pageName: null, currency: "NGN" };
  const expired = row.tokenExpiresAt && row.tokenExpiresAt < new Date();
  return {
    configured,
    status: expired || row.status === "reauth" ? "reauth" : row.status === "connected" ? "connected" : "needs_account",
    accountId: row.accountId,
    accountName: stored.accountName ?? null,
    pageName: stored.pageName ?? null,
    currency: stored.currency ?? "NGN",
  };
}

// ─── Launch ────────────────────────────────────────────────────────────────────

async function resolveTargeting(token: string, audience: AdAudience) {
  const regions: Array<{ key: string }> = [];
  if (audience.countries.includes("NG")) {
    for (const state of audience.states) {
      const found = await graph<{ data?: Array<{ key: string; name: string; country_code?: string; type?: string }> }>("search", token, {
        query: { type: "adgeolocation", location_types: JSON.stringify(["region"]), q: state.replace("Federal Capital Territory", "Abuja"), country_code: "NG", limit: "3" },
      }).catch(() => ({ data: [] }));
      const match = found.data?.find((item) => item.country_code === "NG") ?? found.data?.[0];
      if (match) regions.push({ key: match.key });
    }
  }
  const interests: Array<{ id: string; name: string }> = [];
  for (const word of audience.interests) {
    const found = await graph<{ data?: Array<{ id: string; name: string }> }>("search", token, { query: { type: "adinterest", q: word, limit: "1" } }).catch(() => ({ data: [] }));
    if (found.data?.[0]) interests.push({ id: found.data[0].id, name: found.data[0].name });
  }
  return { regions, interests };
}

async function uploadImage(accountId: string, token: string, url: string) {
  const response = await fetch(url, { signal: AbortSignal.timeout(20_000) }).catch(() => null);
  if (!response?.ok) throw new MetaAdsError("An ad picture couldn't be loaded. Pick another one.");
  const bytes = Buffer.from(await response.arrayBuffer()).toString("base64");
  const result = await graph<{ images?: Record<string, { hash: string }> }>(`${accountId}/adimages`, token, { body: { bytes } });
  const first = Object.values(result.images ?? {})[0];
  if (!first?.hash) throw new MetaAdsError("Facebook didn't take an ad picture. Try another one.");
  return first.hash;
}

async function uploadVideo(accountId: string, token: string, url: string) {
  const created = await graph<{ id?: string }>(`${accountId}/advideos`, token, { body: { file_url: url } });
  if (!created.id) throw new MetaAdsError("Facebook didn't take the video. Try again.");
  // Facebook processes the video before an ad can use it.
  for (let attempt = 0; attempt < 30; attempt++) {
    const info = await graph<{ status?: { video_status?: string } }>(created.id, token, { query: { fields: "status" } }).catch(() => null);
    const status = info?.status?.video_status;
    if (status === "ready") break;
    if (status === "error") throw new MetaAdsError("Facebook couldn't process the video. Try an MP4.");
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  return created.id;
}

async function videoThumb(videoId: string, token: string) {
  const thumbs = await graph<{ data?: Array<{ uri: string; is_preferred?: boolean }> }>(`${videoId}/thumbnails`, token).catch(() => ({ data: [] }));
  return thumbs.data?.find((item) => item.is_preferred)?.uri ?? thumbs.data?.[0]?.uri ?? null;
}

export interface LaunchableCampaign {
  id: string;
  storeId: string;
  code: string;
  name: string | null;
  objective: string | null;
  audience: unknown;
  creatives: unknown;
  dailyBudget: number;
  days: number;
  startAt: Date | null;
}

/** Creates the campaign in the seller's ad account and switches it on. Saves Meta's ids as it goes. */
export async function launchMetaCampaign(campaign: LaunchableCampaign, products: Map<string, { name: string; price: string }>) {
  const { row, stored } = await tokenFor(campaign.storeId);
  if (!row.accountId || !row.externalId) throw new MetaAdsError("Pick your ad account and Facebook Page first.");
  const accountId = row.accountId.startsWith("act_") ? row.accountId : `act_${row.accountId}`;
  const objective = (campaign.objective ?? "traffic") as AdObjective;
  const audience = campaign.audience as AdAudience;
  const creatives = (campaign.creatives ?? []) as AdCreative[];
  const name = campaign.name ?? "Shopinbos campaign";
  const { start, end } = campaignWindow((campaign.startAt ?? new Date()).toISOString(), campaign.days);

  const external: { campaignId?: string; adSetId?: string; adIds: string[] } = { adIds: [] };
  const save = (extra: Partial<Prisma.AdCampaignUpdateInput> = {}) =>
    db.adCampaign.update({ where: { id: campaign.id }, data: { external: external as unknown as Prisma.InputJsonValue, ...extra } });

  try {
    const metaCampaign = await graph<{ id: string }>(`${accountId}/campaigns`, stored.token, { body: metaCampaignBody({ name, objective }) });
    external.campaignId = metaCampaign.id;
    await save();
    const targeting = metaTargeting(audience, await resolveTargeting(stored.token, audience));
    const adSet = await graph<{ id: string }>(`${accountId}/adsets`, stored.token, { body: metaAdSetBody({ name: `${name} · audience`, campaignId: metaCampaign.id, objective, dailyBudget: campaign.dailyBudget, start, end, targeting }) });
    external.adSetId = adSet.id;
    await save();

    for (const [index, creative] of creatives.entries()) {
      const link = `${trackingUrl(campaign.code)}${creative.productId ? `?p=${encodeURIComponent(creative.productId)}` : ""}`;
      const product = creative.productId ? products.get(creative.productId) : null;
      let imageHash: string | null = null;
      let videoId: string | null = null;
      let thumbUrl = creative.thumbUrl ?? null;
      if (creative.kind === "video") {
        videoId = await uploadVideo(accountId, stored.token, creative.mediaUrl);
        thumbUrl = thumbUrl ?? (await videoThumb(videoId, stored.token));
      } else imageHash = await uploadImage(accountId, stored.token, creative.mediaUrl);
      const body = metaCreativeBody({ name: `${name} · ad ${index + 1}`, pageId: row.externalId, instagramId: stored.instagramId, link, creative: { ...creative, thumbUrl }, imageHash, videoId, description: product?.price ?? null });
      const madeCreative = await graph<{ id: string }>(`${accountId}/adcreatives`, stored.token, { body });
      const ad = await graph<{ id: string }>(`${accountId}/ads`, stored.token, { body: { name: `${name} · ad ${index + 1}`, adset_id: adSet.id, creative: { creative_id: madeCreative.id }, status: "ACTIVE" } });
      external.adIds.push(ad.id);
      await save();
    }

    await graph(`${adSet.id}`, stored.token, { body: { status: "ACTIVE" } });
    await graph(`${metaCampaign.id}`, stored.token, { body: { status: "ACTIVE" } });
    await save({ status: "running", startedAt: start, startAt: start, endAt: end, syncError: null, lastSyncAt: new Date() });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Facebook didn't accept the campaign.";
    await save({ syncError: message.slice(0, 500) }).catch(() => null);
    if (error instanceof MetaAdsError && error.reconnect) await db.socialChannelConnection.update({ where: { id: row.id }, data: { status: "reauth" } }).catch(() => null);
    throw error instanceof MetaAdsError ? error : new MetaAdsError(message);
  }
}

function externalOf(value: unknown) {
  const raw = (value ?? {}) as { campaignId?: string; adSetId?: string; adIds?: string[] };
  return { campaignId: raw.campaignId ?? null, adSetId: raw.adSetId ?? null, adIds: raw.adIds ?? [] };
}

export async function setMetaCampaignActive(campaign: { id: string; storeId: string; external: unknown }, active: boolean) {
  const { stored } = await tokenFor(campaign.storeId);
  const ids = externalOf(campaign.external);
  if (!ids.campaignId) throw new MetaAdsError("This campaign isn't on Facebook yet.");
  await graph(ids.campaignId, stored.token, { body: { status: active ? "ACTIVE" : "PAUSED" } });
  await db.adCampaign.update({ where: { id: campaign.id }, data: active ? { status: "running" } : { status: "paused", pausedAt: new Date() } });
}

/** Pulls spend, impressions, reach and link clicks (and the live status) for a Meta campaign. */
export async function syncMetaCampaign(campaign: { id: string; storeId: string; external: unknown }) {
  const ids = externalOf(campaign.external);
  if (!ids.campaignId) return null;
  try {
    const { stored } = await tokenFor(campaign.storeId);
    const [info, insights] = await Promise.all([
      graph<{ effective_status?: string }>(ids.campaignId, stored.token, { query: { fields: "effective_status" } }),
      graph<{ data?: Array<Record<string, unknown>> }>(`${ids.campaignId}/insights`, stored.token, { query: { fields: "spend,impressions,reach,inline_link_clicks", date_preset: "maximum" } }),
    ]);
    const totals = readInsights(insights.data);
    const status = statusFromMeta(info.effective_status);
    return db.adCampaign.update({
      where: { id: campaign.id },
      data: { spend: totals.spend, impressions: totals.impressions, reach: totals.reach, ...(status !== "draft" ? { status } : {}), lastSyncAt: new Date(), syncError: null },
    });
  } catch (error) {
    await db.adCampaign.update({ where: { id: campaign.id }, data: { lastSyncAt: new Date(), syncError: error instanceof Error ? error.message.slice(0, 500) : "Sync failed" } }).catch(() => null);
    return null;
  }
}
