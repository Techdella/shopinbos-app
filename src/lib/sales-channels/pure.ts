// Sell everywhere (/channels): the platforms, when each one can connect, the OAuth state that ties a sign-in to
// the store that started it, the request bodies we send each platform, and what a card shows.
// Pure (node:crypto only, no database, no network) so tests/sales-channels.test.mjs can run it directly.

import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { GOOGLE_CONNECT_SCOPES, googleClient } from "../google/oauth.ts";

/** Platforms that connect for real, in the order Nigerian sellers use them. */
export const LIVE_PLATFORMS = ["whatsapp", "meta", "tiktok", "google"] as const;
export type LivePlatform = (typeof LIVE_PLATFORMS)[number];

/** The ones that sign in with OAuth here (WhatsApp signs in with Meta's Embedded Signup popup instead). */
export const OAUTH_PLATFORMS = ["meta", "tiktok", "google"] as const;
export type OAuthPlatform = (typeof OAUTH_PLATFORMS)[number];

/**
 * Shown greyed with "Coming soon" and "Tell me when it's ready". TikTok is first: TikTok Shop and its catalog
 * aren't open to Nigerian sellers, so its card is hidden (unless a store linked it before) and sellers post to
 * TikTok from "Post & share" instead.
 */
export const COMING_SOON_PLATFORMS = ["tiktok", "pinterest", "snapchat", "amazon", "jumia", "konga", "jiji", "ebay", "etsy", "shopify"] as const;
export type ComingSoonPlatform = (typeof COMING_SOON_PLATFORMS)[number];

/** The marketplaces Nigerian sellers sell on, shown on Sell everywhere (all coming soon for now). */
export const MARKETPLACE_PLATFORMS = ["jumia", "konga", "jiji", "amazon", "ebay", "etsy"] as const satisfies readonly ComingSoonPlatform[];

export const PLATFORM_NAME: Record<LivePlatform | ComingSoonPlatform, string> = {
  whatsapp: "WhatsApp",
  meta: "Facebook & Instagram",
  tiktok: "TikTok",
  google: "Google",
  pinterest: "Pinterest",
  snapchat: "Snapchat",
  amazon: "Amazon",
  jumia: "Jumia",
  konga: "Konga",
  jiji: "Jiji",
  ebay: "eBay",
  etsy: "Etsy",
  shopify: "Shopify",
};

export function isOAuthPlatform(value: unknown): value is OAuthPlatform {
  return typeof value === "string" && (OAUTH_PLATFORMS as readonly string[]).includes(value);
}

export function isComingSoon(value: unknown): value is ComingSoonPlatform {
  return typeof value === "string" && (COMING_SOON_PLATFORMS as readonly string[]).includes(value);
}

/** Live platforms whose card is hidden until they open in Nigeria (shown only to a store that already linked it). */
export const PAUSED_PLATFORMS: readonly LivePlatform[] = ["tiktok"];

type Env = Record<string, string | undefined>;
const set = (value: string | undefined) => Boolean(value && value.trim());

/**
 * Can this platform's Connect button work on this server? Each needs its app credentials, and every one stores
 * tokens, so INBOX_ENCRYPTION_KEY too. When false the card says "Coming soon" instead of starting a broken flow.
 */
export function platformConfigured(platform: LivePlatform, env: Env = process.env): boolean {
  const key = (env.INBOX_ENCRYPTION_KEY ?? "").trim().length >= 16;
  if (!key) return false;
  switch (platform) {
    case "meta":
      // META_CATALOG_CONFIG_ID is optional: without it the sign-in asks for META_LOGIN_SCOPES directly.
      return set(env.META_APP_ID) && set(env.META_APP_SECRET);
    case "whatsapp":
      return set(env.META_APP_ID) && set(env.META_APP_SECRET) && set(env.META_CONFIG_ID);
    case "google":
      return set(googleClient("merchant", env).id) && set(googleClient("merchant", env).secret);
    case "tiktok":
      return set(env.TIKTOK_APP_ID) && set(env.TIKTOK_APP_SECRET);
  }
}

// ─── OAuth state ────────────────────────────────────────────────────────────
// The state names the store and platform, carries a random nonce that is also set in an httpOnly cookie on the
// browser that started the sign-in, and is signed (HMAC-SHA256) with a key derived from INBOX_ENCRYPTION_KEY.
// The callback only accepts a fresh, correctly signed state for its own platform, from the same browser (cookie),
// for the store of the seller who is signed in.

export const STATE_MAX_AGE_MS = 15 * 60_000;

export interface OAuthState {
  storeId: string;
  platform: OAuthPlatform;
  nonce: string;
  /** issued at, ms */
  iat: number;
}

function stateSig(payload: string, key: Buffer) {
  return createHmac("sha256", key).update(`sales-channel-state:${payload}`).digest("base64url");
}

export function newNonce() {
  return randomBytes(18).toString("base64url");
}

export function signState(state: OAuthState, key: Buffer): string {
  const payload = Buffer.from(JSON.stringify({ s: state.storeId, p: state.platform, n: state.nonce, t: state.iat })).toString("base64url");
  return `${payload}.${stateSig(payload, key)}`;
}

export function readState(value: string | null | undefined, key: Buffer, now = Date.now()): OAuthState | null {
  if (!value || value.length > 1000) return null;
  const [payload, sig, extra] = value.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const expected = Buffer.from(stateSig(payload, key));
  const given = Buffer.from(sig);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  let raw: { s?: unknown; p?: unknown; n?: unknown; t?: unknown };
  try {
    raw = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (typeof raw.s !== "string" || !isOAuthPlatform(raw.p) || typeof raw.n !== "string" || typeof raw.t !== "number") return null;
  if (raw.t > now + 60_000 || now - raw.t > STATE_MAX_AGE_MS) return null;
  return { storeId: raw.s, platform: raw.p, nonce: raw.n, iat: raw.t };
}

/** The full callback check: signed, fresh, this platform, this browser's nonce cookie, this seller's store. */
export function checkCallbackState(
  value: string | null | undefined,
  expect: { platform: OAuthPlatform; storeId: string | null | undefined; nonceCookie: string | null | undefined },
  key: Buffer,
  now = Date.now(),
): OAuthState | null {
  const state = readState(value, key, now);
  if (!state || !expect.storeId || !expect.nonceCookie) return null;
  if (state.platform !== expect.platform || state.storeId !== expect.storeId) return null;
  const a = Buffer.from(state.nonce);
  const b = Buffer.from(expect.nonceCookie);
  return a.length === b.length && timingSafeEqual(a, b) ? state : null;
}

export const nonceCookieName = (platform: OAuthPlatform) => `sib_sc_${platform}`;

// ─── Sign-in URLs ───────────────────────────────────────────────────────────

export const GOOGLE_CONTENT_SCOPE = "https://www.googleapis.com/auth/content";
/** "Connect Google" asks once for everything (src/lib/google/oauth.ts): shopping, reviews, search, visitor stats. */
export const GOOGLE_SCOPE = GOOGLE_CONNECT_SCOPES.join(" ");

/** What "Connect Facebook & Instagram" asks for when no Login for Business configuration is set. */
export const META_LOGIN_SCOPES = [
  "business_management",
  "catalog_management",
  "pages_show_list",
  "pages_read_engagement",
  "pages_messaging",
  "pages_manage_metadata",
  "instagram_basic",
  "instagram_manage_messages",
  // Social posts (Marketing > Social posts) post to the Page and Instagram for the seller.
  "pages_manage_posts",
  "instagram_content_publish",
] as const;

export function redirectUri(origin: string, platform: OAuthPlatform) {
  return `${origin.replace(/\/+$/, "")}/api/app/sales-channels/${platform}/callback`;
}

export function authorizeUrl(platform: OAuthPlatform, options: { origin: string; state: string; env?: Env; graphVersion?: string }): string {
  const env = options.env ?? process.env;
  const redirect_uri = redirectUri(options.origin, platform);
  if (platform === "meta" && !set(env.META_CATALOG_CONFIG_ID)) {
    // Classic Facebook Login: no configuration to get wrong; asks for every permission by name.
    const params = new URLSearchParams({ client_id: env.META_APP_ID ?? "", redirect_uri, state: options.state, response_type: "code", scope: META_LOGIN_SCOPES.join(",") });
    return `https://www.facebook.com/${options.graphVersion ?? "v21.0"}/dialog/oauth?${params}`;
  }
  if (platform === "meta") {
    // Facebook Login for Business: the configuration (META_CATALOG_CONFIG_ID) holds the permissions and the token
    // type. One sign-in covers the catalog (catalog_management, business_management) and the seller's Page and
    // Instagram messages (pages_show_list, pages_messaging, pages_manage_metadata, instagram_basic,
    // instagram_manage_messages), and posting for Social posts (pages_manage_posts, instagram_content_publish),
    // so "Connect Facebook & Instagram" turns on all of it. See .env.local.example.
    const params = new URLSearchParams({
      client_id: env.META_APP_ID ?? "",
      redirect_uri,
      state: options.state,
      config_id: env.META_CATALOG_CONFIG_ID ?? "",
      response_type: "code",
      override_default_response_type: "true",
    });
    return `https://www.facebook.com/${options.graphVersion ?? "v21.0"}/dialog/oauth?${params}`;
  }
  if (platform === "google") {
    const params = new URLSearchParams({
      client_id: googleClient("merchant", env).id,
      redirect_uri,
      response_type: "code",
      scope: GOOGLE_SCOPE,
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: "true",
      state: options.state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params}`;
  }
  const params = new URLSearchParams({ app_id: env.TIKTOK_APP_ID ?? "", state: options.state, redirect_uri });
  return `https://business-api.tiktok.com/portal/auth?${params}`;
}

// ─── What we send each platform ─────────────────────────────────────────────

const FEED_HOUR = 3; // 03:00 Lagos: after the night's stock changes, before shoppers wake up

const label = (storeName: string) => `${storeName.trim().slice(0, 60) || "My shop"} (Shopinbos)`;

/** POST /{business_id}/owned_product_catalogs */
export function metaCatalogBody(storeName: string) {
  return { name: label(storeName), vertical: "commerce" };
}

/** POST /{catalog_id}/product_feeds: Meta fetches our feed every day. */
export function metaFeedBody(feedUrl: string, storeName: string) {
  return { name: `Shopinbos: ${storeName.trim().slice(0, 60)}`, schedule: { interval: "DAILY", url: feedUrl, hour: FEED_HOUR } };
}

/** Merchant API: POST https://merchantapi.googleapis.com/datasources/v1/accounts/{id}/dataSources */
export function googleDataSourceBody(feedUrl: string, storeName: string) {
  return {
    displayName: `Shopinbos: ${storeName.trim().slice(0, 60)}`,
    primaryProductDataSource: { contentLanguage: "en", feedLabel: "NG", countries: ["NG"] },
    fileInput: {
      fileName: "shopinbos-google.xml",
      fetchSettings: { enabled: true, frequency: "FREQUENCY_DAILY", timeOfDay: { hours: FEED_HOUR }, timeZone: "Africa/Lagos", fetchUri: feedUrl },
    },
  };
}

/** TikTok Business API: POST /open_api/v1.3/catalog/create/ */
export function tiktokCatalogBody(bcId: string, storeName: string, currency = "NGN") {
  return { bc_id: bcId, catalog_name: label(storeName), catalog_type: "ECOM", catalog_conf: { region_code: "NG", currency } };
}

/** TikTok Business API: POST /open_api/v1.3/catalog/feed/create/ (scheduled daily fetch of our feed). */
export function tiktokFeedBody(bcId: string, catalogId: string, feedUrl: string, storeName: string) {
  return {
    bc_id: bcId,
    catalog_id: catalogId,
    feed_name: `Shopinbos: ${storeName.trim().slice(0, 60)}`,
    update_mode: "OVERWRITE",
    schedule_param: { source: { uri: feedUrl }, interval_type: "DAILY", timezone: "Africa/Lagos", hour: FEED_HOUR, minute: 0 },
  };
}

// ─── Tokens ─────────────────────────────────────────────────────────────────

export interface StoredTokens {
  token: string;
  refreshToken?: string;
}

/** Older rows hold { token } from the pasted-token form; new ones may add a refresh token. */
export function readTokens(value: unknown): StoredTokens | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  if (typeof raw.token !== "string" || !raw.token) return null;
  return { token: raw.token, ...(typeof raw.refreshToken === "string" && raw.refreshToken ? { refreshToken: raw.refreshToken } : {}) };
}

/** A Google access token is refreshed a minute before it runs out. */
export function needsRefresh(expiresAt: Date | null | undefined, now = Date.now()) {
  return Boolean(expiresAt && expiresAt.getTime() <= now + 60_000);
}

// ─── Cards ──────────────────────────────────────────────────────────────────

export type CardState =
  | { kind: "soon" }
  | { kind: "connect" }
  | { kind: "syncing" }
  | { kind: "connected"; count: number | null }
  | { kind: "error" }
  | { kind: "reauth" }
  | { kind: "needs_account" };

export interface ConnectionLike {
  status: string | null;
  tokenEnc: string | null;
  productCount: number | null;
  lastSyncStatus: string | null;
}

/** What a Facebook & Instagram, TikTok or Google card shows. */
export function cardState(configured: boolean, connection: ConnectionLike | null): CardState {
  const linked = Boolean(connection?.tokenEnc);
  if (!linked) return configured ? { kind: "connect" } : { kind: "soon" };
  switch (connection!.status) {
    case "syncing":
      return { kind: "syncing" };
    case "error":
      return { kind: "error" };
    case "reauth":
      return configured ? { kind: "reauth" } : { kind: "error" };
    case "needs_account":
      return { kind: "needs_account" };
    case "connected":
      return { kind: "connected", count: connection!.productCount };
    default:
      // A catalog linked earlier with a pasted token: still connected.
      return connection!.lastSyncStatus === "error" ? { kind: "error" } : { kind: "connected", count: connection!.productCount };
  }
}

export interface WhatsAppCatalogLike {
  catalogId: string | null;
  lastSyncAt: Date | null;
  lastSyncStatus: string | null;
  syncing: boolean;
}

/** The WhatsApp card, from the WhatsApp catalog (src/lib/whatsapp-catalog) and whether WhatsApp is connected. */
export function whatsappCardState(options: { signupConfigured: boolean; whatsappConnected: boolean; catalog: WhatsAppCatalogLike | null; synced: number }): CardState {
  const { catalog } = options;
  if (!catalog?.catalogId) return options.signupConfigured || options.whatsappConnected ? { kind: "connect" } : { kind: "soon" };
  if (!options.whatsappConnected) return { kind: "reauth" };
  if (catalog.syncing || !catalog.lastSyncAt) return { kind: "syncing" };
  if (catalog.lastSyncStatus === "error") return { kind: "error" };
  return { kind: "connected", count: options.synced };
}

/** Which error kinds mean "sign in again" rather than "try again". */
export function isAuthProblem(message: string) {
  return /\b(401|invalid_grant|expired|revoked|session has been invalidated|error validating access token|access token|unauthori[sz]ed|permission|not authorized|insufficient)/i.test(message);
}

// ─── Connecting from the phone app ──────────────────────────────────────────
// The app runs the same sign-in in an in-app browser (expo-web-browser openAuthSessionAsync) and passes
// ?app=<its return address> to the connect route. The callback then sends the seller back into the app instead
// of /channels. Only the app's own scheme is accepted, plus Expo Go (exp://) on this computer or the local
// network while developing, so the callback can't be used to send people anywhere else.

export const appReturnCookieName = (platform: OAuthPlatform) => `sib_sc_app_${platform}`;

const PRIVATE_HOST = /^(localhost|127(?:\.\d{1,3}){3}|10(?:\.\d{1,3}){3}|192\.168(?:\.\d{1,3}){2}|172\.(?:1[6-9]|2\d|3[01])(?:\.\d{1,3}){2})$/;

/** The app's return address, or null when it isn't one of ours. */
export function appReturnUrl(value: string | null | undefined): string | null {
  if (!value || value.length > 300 || /[\s\\]/.test(value)) return null;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.username || url.password) return null;
  if (url.protocol === "shopinbos:") return value;
  if ((url.protocol === "exp:" || url.protocol === "exps:") && PRIVATE_HOST.test(url.hostname)) return value;
  return null;
}

// ─── Where the web sign-in ends ─────────────────────────────────────────────
// "Connect" can start from /channels, Inbox → Channels or Start here; the callback sends the seller back to the
// page they started on (?next=, kept in an httpOnly cookie). Only these pages are accepted.

export const RETURN_PATHS = ["/channels", "/home/marketing/social/accounts", "/home/connections", "/home/inbox/channels", "/home/start", "/home/reviews/sources", "/home/analytics/traffic"] as const;

export const returnCookieName = (platform: OAuthPlatform) => `sib_sc_next_${platform}`;

/** The page to end on, or null when it isn't one of ours. */
export function safeReturnPath(value: string | null | undefined): (typeof RETURN_PATHS)[number] | null {
  return (RETURN_PATHS as readonly string[]).includes(value ?? "") ? (value as (typeof RETURN_PATHS)[number]) : null;
}

export type AppConnectResult = "connected" | "problem" | "closed";

/** shopinbos://channels?connected=meta (or problem=, or closed=): where the callback sends the app. */
export function appResultUrl(base: string, platform: OAuthPlatform, result: AppConnectResult): string {
  const [path, query = ""] = base.split("?");
  const params = new URLSearchParams(query);
  params.delete("connected");
  params.delete("problem");
  params.delete("closed");
  params.set(result, platform);
  return `${path}?${params.toString()}`;
}

/** Which button actions a card can take from the app (the web's server actions in src/app/channels/actions.ts). */
export type ChannelAction = "retry" | "notify";

export function channelActionAllowed(platform: string, action: ChannelAction): boolean {
  if (action === "notify") return isComingSoon(platform);
  return platform === "whatsapp" || isOAuthPlatform(platform);
}

export function isLivePlatform(value: unknown): value is LivePlatform {
  return typeof value === "string" && (LIVE_PLATFORMS as readonly string[]).includes(value);
}
