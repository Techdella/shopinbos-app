import "server-only";

import { GRAPH_VERSION } from "@/lib/inbox/channels/types";
import { debugToken, graph, graphBase } from "@/lib/whatsapp-catalog/graph";
import { grantedTargets } from "@/lib/whatsapp-catalog/pure";
import { pushMetaCatalog } from "@/lib/social/server";
import {
  googleDataSourceBody,
  metaCatalogBody,
  metaFeedBody,
  redirectUri,
  tiktokCatalogBody,
  tiktokFeedBody,
  type OAuthPlatform,
  type StoredTokens,
} from "./pure";

// The three platforms that connect with OAuth here. Each one: exchange the sign-in code for tokens, find (or
// create) the seller's catalog there and register our product feed on a daily schedule, then report how many
// products the platform has. Tokens never leave the server or reach a log line.
//
//   meta    Facebook Login for Business → business → product catalog (+ daily product feed, + instant items_batch
//           push of every product). Instagram Shopping and the Facebook Shop use the same catalog.
//   google  Google OAuth (content scope) → Merchant Center account → Merchant API file data source fetching our
//           Google feed daily. (The Content API for Shopping was switched off in 2026; this uses the Merchant API.)
//   tiktok  TikTok for Business OAuth → Business Center → e-commerce catalog → daily feed. (TikTok Shop isn't open in
//           Nigeria; the catalog powers catalog ads and product links.)

export class ChannelError extends Error {
  constructor(message: string, readonly auth = false) {
    super(message);
  }
}

export interface StoreRef {
  id: string;
  name: string;
  slug: string;
  customDomain: string | null;
  currency: string;
}

export interface ProviderContext {
  store: StoreRef;
  tokens: StoredTokens;
  accountId: string | null;
  catalogId: string | null;
  feedId: string | null;
  feedUrl: (file: string) => string;
}

export interface Exchanged {
  tokens: StoredTokens;
  expiresAt: Date | null;
}

export type SetupResult = { needsAccount: true } | { needsAccount: false; accountId: string; catalogId: string | null; feedId: string | null };

export interface Provider {
  exchange(code: string, origin: string): Promise<Exchanged>;
  /** Google only: a fresh access token when the stored one is about to run out. */
  refresh?(tokens: StoredTokens): Promise<Exchanged>;
  setup(ctx: ProviderContext): Promise<SetupResult>;
  sync(ctx: ProviderContext): Promise<{ productCount: number | null }>;
  /** Best effort, on Disconnect: stop the platform fetching our feed and revoke what can be revoked. */
  remove(ctx: ProviderContext): Promise<void>;
}

const TIMEOUT = 30_000;

async function readJson(res: Response) {
  return ((await res.json().catch(() => null)) ?? {}) as Record<string, unknown>;
}

// ─── Meta ───────────────────────────────────────────────────────────────────

function metaFail(result: { status: number; error: { kind: string; message: string } }): never {
  throw new ChannelError(result.error.message, result.error.kind === "token" || result.error.kind === "permission");
}

async function metaTokenCall(params: Record<string, string>) {
  const url = new URL(`${graphBase()}/oauth/access_token`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000), cache: "no-store" }).catch(() => null);
  if (!res) throw new ChannelError("Couldn't reach Facebook. Try again.");
  const json = await readJson(res);
  if (!res.ok || typeof json.access_token !== "string") {
    const message = (json.error as { message?: string } | undefined)?.message ?? `Facebook answered ${res.status}`;
    throw new ChannelError(message, true);
  }
  return json as { access_token: string; expires_in?: number };
}

const meta: Provider = {
  async exchange(code, origin) {
    const app = { client_id: process.env.META_APP_ID ?? "", client_secret: process.env.META_APP_SECRET ?? "" };
    const first = await metaTokenCall({ ...app, redirect_uri: redirectUri(origin, "meta"), code });
    // A user token becomes a 60-day one; a system-user (business integration) token already never expires.
    let token = first.access_token;
    const long = await metaTokenCall({ ...app, grant_type: "fb_exchange_token", fb_exchange_token: token }).catch(() => null);
    if (long) token = long.access_token;
    const info = await debugToken(token);
    const expires = typeof info?.expires_at === "number" ? info.expires_at : null;
    return { tokens: { token }, expiresAt: expires ? new Date(expires * 1000) : null };
  },

  async setup(ctx) {
    const token = ctx.tokens.token;
    const info = ctx.accountId && ctx.catalogId ? null : await debugToken(token);
    let catalogId = ctx.catalogId;
    // Facebook Login for Business lists the catalogs the seller ticked under catalog_management.
    if (!catalogId) {
      for (const id of grantedTargets(info, "catalog_management")) {
        const check = await graph(encodeURIComponent(id), token, { query: { fields: "id,name" } });
        if (check.ok) {
          catalogId = id;
          break;
        }
      }
    }
    let businessId: string | null = ctx.accountId ?? grantedTargets(info, "business_management")[0] ?? null;
    if (!businessId) {
      const mine = await graph("me/businesses", token, { query: { fields: "id,name", limit: "10" } });
      const list = mine.ok && Array.isArray(mine.json.data) ? (mine.json.data as Array<{ id?: unknown }>) : [];
      businessId = list.map((item) => item.id).find((id): id is string => typeof id === "string") ?? null;
    }
    if (!catalogId) {
      if (!businessId) return { needsAccount: true };
      const wanted = metaCatalogBody(ctx.store.name);
      const owned = await graph(`${encodeURIComponent(businessId)}/owned_product_catalogs`, token, { query: { fields: "id,name", limit: "100" } });
      if (!owned.ok) metaFail(owned);
      const list = Array.isArray(owned.json.data) ? (owned.json.data as Array<{ id?: unknown; name?: unknown }>) : [];
      // Ours from an earlier connect, else the one they already use (their Instagram shop), else a new one.
      const pick = list.find((item) => item.name === wanted.name) ?? list[0];
      if (typeof pick?.id === "string") catalogId = pick.id;
      else {
        const created = await graph(`${encodeURIComponent(businessId)}/owned_product_catalogs`, token, { body: wanted });
        if (!created.ok) metaFail(created);
        catalogId = typeof created.json.id === "string" ? created.json.id : null;
        if (!catalogId) throw new ChannelError("Facebook didn't return the new catalog.");
      }
    }
    let feedId = ctx.feedId;
    if (!feedId) {
      // A daily feed keeps Facebook up to date even if our pushes stop; failing here isn't fatal (we push anyway).
      const feed = await graph(`${encodeURIComponent(catalogId)}/product_feeds`, token, { body: metaFeedBody(ctx.feedUrl("meta.csv"), ctx.store.name) });
      if (feed.ok && typeof feed.json.id === "string") feedId = feed.json.id;
    }
    return { needsAccount: false, accountId: businessId ?? catalogId, catalogId, feedId };
  },

  async sync(ctx) {
    if (!ctx.catalogId) throw new ChannelError("No catalog yet.");
    await pushMetaCatalog(ctx.store, "meta", ctx.catalogId, ctx.tokens.token).catch((error: Error) => {
      throw new ChannelError(error.message, /token|session|permission|authori/i.test(error.message));
    });
    const count = await graph(encodeURIComponent(ctx.catalogId), ctx.tokens.token, { query: { fields: "product_count" } });
    return { productCount: count.ok && typeof count.json.product_count === "number" ? count.json.product_count : null };
  },

  async remove(ctx) {
    if (ctx.feedId) await graph(encodeURIComponent(ctx.feedId), ctx.tokens.token, { method: "DELETE" }).catch(() => null);
  },
};

// ─── Google (Merchant API) ──────────────────────────────────────────────────

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const MERCHANT = (process.env.GOOGLE_MERCHANT_API_BASE_URL || "https://merchantapi.googleapis.com").replace(/\/$/, "");

async function googleToken(body: Record<string, string>): Promise<Exchanged & { refreshToken?: string }> {
  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GOOGLE_MERCHANT_CLIENT_ID ?? "", client_secret: process.env.GOOGLE_MERCHANT_CLIENT_SECRET ?? "", ...body }),
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res) throw new ChannelError("Couldn't reach Google. Try again.");
  const json = (await readJson(res)) as { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string };
  if (!res.ok || !json.access_token) throw new ChannelError(json.error_description || json.error || `Google answered ${res.status}`, true);
  return { tokens: { token: json.access_token, ...(json.refresh_token ? { refreshToken: json.refresh_token } : {}) }, expiresAt: new Date(Date.now() + (json.expires_in ?? 3600) * 1000) };
}

async function merchant(path: string, token: string, init: { method?: string; body?: unknown } = {}) {
  const res = await fetch(`${MERCHANT}/${path.replace(/^\//, "")}`, {
    method: init.method ?? (init.body ? "POST" : "GET"),
    headers: { Authorization: `Bearer ${token}`, ...(init.body ? { "Content-Type": "application/json" } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  }).catch(() => null);
  if (!res) throw new ChannelError("Couldn't reach Google. Try again.");
  const json = await readJson(res);
  if (!res.ok) {
    const message = (json.error as { message?: string } | undefined)?.message ?? `Google answered ${res.status}`;
    throw new ChannelError(message, res.status === 401 || res.status === 403);
  }
  return json;
}

const google: Provider = {
  exchange(code, origin) {
    return googleToken({ code, grant_type: "authorization_code", redirect_uri: redirectUri(origin, "google") });
  },

  async refresh(tokens) {
    if (!tokens.refreshToken) throw new ChannelError("Google sign-in ran out.", true);
    const fresh = await googleToken({ refresh_token: tokens.refreshToken, grant_type: "refresh_token" });
    // Google doesn't send the refresh token again; keep ours.
    return { tokens: { token: fresh.tokens.token, refreshToken: fresh.tokens.refreshToken ?? tokens.refreshToken }, expiresAt: fresh.expiresAt };
  },

  async setup(ctx) {
    let accountId = ctx.accountId;
    if (!accountId) {
      const json = await merchant("accounts/v1/accounts?pageSize=50", ctx.tokens.token);
      const accounts = Array.isArray(json.accounts) ? (json.accounts as Array<{ accountId?: unknown; name?: unknown }>) : [];
      const first = accounts[0];
      accountId = typeof first?.accountId === "string" ? first.accountId : typeof first?.name === "string" ? first.name.replace(/^accounts\//, "") : null;
      if (!accountId) return { needsAccount: true };
    }
    let feedId = ctx.feedId;
    if (!feedId) {
      const created = await merchant(`datasources/v1/accounts/${encodeURIComponent(accountId)}/dataSources`, ctx.tokens.token, { body: googleDataSourceBody(ctx.feedUrl("google.xml"), ctx.store.name) });
      feedId = typeof created.name === "string" ? created.name : null;
      if (!feedId) throw new ChannelError("Google didn't return the product feed it created.");
    }
    return { needsAccount: false, accountId, catalogId: accountId, feedId };
  },

  async sync(ctx) {
    // Ask Google to fetch the feed now (it also fetches daily); limited per day, so a refusal is fine.
    if (ctx.feedId) await merchant(`datasources/v1/${ctx.feedId}:fetch`, ctx.tokens.token, { method: "POST", body: {} }).catch(() => null);
    let count = 0;
    let pageToken = "";
    for (let page = 0; page < 5; page++) {
      const json = await merchant(`products/v1/accounts/${encodeURIComponent(ctx.accountId ?? "")}/products?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""}`, ctx.tokens.token);
      count += Array.isArray(json.products) ? json.products.length : 0;
      pageToken = typeof json.nextPageToken === "string" ? json.nextPageToken : "";
      if (!pageToken) break;
    }
    return { productCount: count };
  },

  async remove(ctx) {
    if (ctx.feedId) await merchant(`datasources/v1/${ctx.feedId}`, ctx.tokens.token, { method: "DELETE" }).catch(() => null);
    const revoke = ctx.tokens.refreshToken ?? ctx.tokens.token;
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(revoke)}`, { method: "POST", signal: AbortSignal.timeout(10_000) }).catch(() => null);
  },
};

// ─── TikTok for Business ────────────────────────────────────────────────────

const TIKTOK = `${(process.env.TIKTOK_API_BASE_URL || "https://business-api.tiktok.com").replace(/\/$/, "")}/open_api/v1.3`;
// 40001–40105: auth and permission problems (bad, expired or revoked token; scope not granted).
const TIKTOK_AUTH = /^401|^4000[1-2]|^4010/;

async function tiktok(path: string, token: string | null, init: { query?: Record<string, string>; body?: unknown } = {}) {
  const url = new URL(`${TIKTOK}/${path.replace(/^\//, "")}`);
  for (const [key, value] of Object.entries(init.query ?? {})) url.searchParams.set(key, value);
  const res = await fetch(url, {
    method: init.body ? "POST" : "GET",
    headers: { ...(token ? { "Access-Token": token } : {}), "Content-Type": "application/json" },
    body: init.body ? JSON.stringify(init.body) : undefined,
    signal: AbortSignal.timeout(TIMEOUT),
    cache: "no-store",
  }).catch(() => null);
  if (!res) throw new ChannelError("Couldn't reach TikTok. Try again.");
  const json = await readJson(res);
  const code = typeof json.code === "number" ? json.code : res.ok ? 0 : res.status;
  if (code !== 0) throw new ChannelError(typeof json.message === "string" ? json.message : `TikTok answered ${code}`, TIKTOK_AUTH.test(String(code)));
  return (json.data ?? {}) as Record<string, unknown>;
}

const tiktokProvider: Provider = {
  async exchange(code) {
    const data = await tiktok("oauth2/access_token/", null, { body: { app_id: process.env.TIKTOK_APP_ID ?? "", secret: process.env.TIKTOK_APP_SECRET ?? "", auth_code: code } });
    if (typeof data.access_token !== "string") throw new ChannelError("TikTok didn't send a sign-in token.", true);
    // Marketing API tokens don't expire until the seller removes the app.
    return { tokens: { token: data.access_token }, expiresAt: null };
  },

  async setup(ctx) {
    const token = ctx.tokens.token;
    let bcId = ctx.accountId;
    if (!bcId) {
      const data = await tiktok("bc/get/", token);
      const list = Array.isArray(data.list) ? (data.list as Array<{ bc_info?: { bc_id?: unknown } }>) : [];
      const id = list[0]?.bc_info?.bc_id;
      bcId = typeof id === "string" || typeof id === "number" ? String(id) : null;
      if (!bcId) return { needsAccount: true };
    }
    let catalogId = ctx.catalogId;
    if (!catalogId) {
      const wanted = tiktokCatalogBody(bcId, ctx.store.name, (ctx.store.currency || "NGN").toUpperCase());
      const data = await tiktok("catalog/get/", token, { query: { bc_id: bcId, page_size: "100" } });
      const list = Array.isArray(data.list) ? (data.list as Array<{ catalog_id?: unknown; catalog_name?: unknown }>) : [];
      const mine = list.find((item) => item.catalog_name === wanted.catalog_name);
      if (mine?.catalog_id) catalogId = String(mine.catalog_id);
      else {
        const created = await tiktok("catalog/create/", token, { body: wanted });
        catalogId = created.catalog_id ? String(created.catalog_id) : null;
        if (!catalogId) throw new ChannelError("TikTok didn't return the new catalog.");
      }
    }
    let feedId = ctx.feedId;
    if (!feedId) {
      const feed = await tiktok("catalog/feed/create/", token, { body: tiktokFeedBody(bcId, catalogId, ctx.feedUrl("tiktok.csv"), ctx.store.name) });
      feedId = feed.feed_id ? String(feed.feed_id) : null;
    }
    return { needsAccount: false, accountId: bcId, catalogId, feedId };
  },

  async sync(ctx) {
    if (!ctx.accountId || !ctx.catalogId) throw new ChannelError("No catalog yet.");
    const data = await tiktok("catalog/overview/", ctx.tokens.token, { query: { bc_id: ctx.accountId, catalog_id: ctx.catalogId } });
    const numbers = ["approved", "processing", "rejected"].map((key) => (typeof data[key] === "number" ? (data[key] as number) : null));
    if (numbers.every((value) => value === null)) return { productCount: null };
    return { productCount: (numbers[0] ?? 0) + (numbers[1] ?? 0) };
  },

  async remove() {
    // Leave the catalog and feed in the seller's Business Center (theirs); we only forget the token.
  },
};

export const PROVIDERS: Record<OAuthPlatform, Provider> = { meta, google, tiktok: tiktokProvider };
export { GRAPH_VERSION };
