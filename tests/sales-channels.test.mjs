// Sell everywhere (/channels): which platforms can connect on this server (Connect vs Coming soon), the OAuth state
// that ties a sign-in to the store and browser that started it, encrypted token storage, the feed registration
// requests we send Meta, Google and TikTok, what each card shows, and "Tell me when it's ready".
// Pure helpers (src/lib/sales-channels/pure.ts, src/lib/inbox/crypto.ts) plus source checks of the routes.
import test from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const sc = await import("../src/lib/sales-channels/pure.ts");
const crypto = await import("../src/lib/inbox/crypto.ts");

const ROOT = new URL("..", import.meta.url).pathname;
const read = (path) => readFileSync(join(ROOT, path), "utf8");

const KEY = "k".repeat(32);
const FULL = {
  INBOX_ENCRYPTION_KEY: KEY,
  META_APP_ID: "123",
  META_APP_SECRET: "s",
  META_CONFIG_ID: "wa-config",
  META_CATALOG_CONFIG_ID: "cat-config",
  GOOGLE_MERCHANT_CLIENT_ID: "g-id",
  GOOGLE_MERCHANT_CLIENT_SECRET: "g-secret",
  TIKTOK_APP_ID: "tt-id",
  TIKTOK_APP_SECRET: "tt-secret",
};

// ─── Env gating ─────────────────────────────────────────────────────────────

test("each platform connects only when its app keys and the encryption key are set", () => {
  for (const platform of sc.LIVE_PLATFORMS) assert.equal(sc.platformConfigured(platform, FULL), true, platform);
  for (const platform of sc.LIVE_PLATFORMS) assert.equal(sc.platformConfigured(platform, { ...FULL, INBOX_ENCRYPTION_KEY: "" }), false, `${platform} without a key`);
  assert.equal(sc.platformConfigured("meta", { ...FULL, META_CATALOG_CONFIG_ID: "" }), true, "the Login for Business configuration is optional");
  assert.equal(sc.platformConfigured("meta", { ...FULL, META_APP_SECRET: "" }), false);
  assert.equal(sc.platformConfigured("whatsapp", { ...FULL, META_CATALOG_CONFIG_ID: "" }), true, "WhatsApp uses the Embedded Signup configuration");
  assert.equal(sc.platformConfigured("whatsapp", { ...FULL, META_CONFIG_ID: " " }), false);
  assert.equal(sc.platformConfigured("google", { ...FULL, GOOGLE_MERCHANT_CLIENT_SECRET: undefined }), false);
  assert.equal(sc.platformConfigured("tiktok", { ...FULL, TIKTOK_APP_ID: "" }), false);
  assert.equal(sc.platformConfigured("google", { INBOX_ENCRYPTION_KEY: KEY, GOOGLE_BUSINESS_CLIENT_ID: "x", GOOGLE_BUSINESS_CLIENT_SECRET: "y" }), false, "the reviews client isn't reused");
});

test("cards: Connect when configured, Coming soon when not, never a broken flow", () => {
  assert.deepEqual(sc.cardState(true, null), { kind: "connect" });
  assert.deepEqual(sc.cardState(false, null), { kind: "soon" });
  const row = (over) => ({ status: "connected", tokenEnc: "v1:x", productCount: 12, lastSyncStatus: "ok", ...over });
  assert.deepEqual(sc.cardState(true, row()), { kind: "connected", count: 12 });
  assert.deepEqual(sc.cardState(true, row({ status: "syncing" })), { kind: "syncing" });
  assert.deepEqual(sc.cardState(true, row({ status: "error" })), { kind: "error" });
  assert.deepEqual(sc.cardState(true, row({ status: "reauth" })), { kind: "reauth" });
  assert.deepEqual(sc.cardState(false, row({ status: "reauth" })), { kind: "error" }, "no Connect again when the app keys are gone");
  assert.deepEqual(sc.cardState(true, row({ status: "needs_account" })), { kind: "needs_account" });
  assert.deepEqual(sc.cardState(true, row({ tokenEnc: null })), { kind: "connect" }, "a disconnected row");
  assert.deepEqual(sc.cardState(true, row({ status: null, productCount: null })), { kind: "connected", count: null }, "older pasted-token connections stay connected");

  const wa = (over) => sc.whatsappCardState({ signupConfigured: true, whatsappConnected: true, catalog: { catalogId: "c1", lastSyncAt: new Date(), lastSyncStatus: "ok", syncing: false }, synced: 7, ...over });
  assert.deepEqual(wa(), { kind: "connected", count: 7 });
  assert.deepEqual(wa({ catalog: null, signupConfigured: false, whatsappConnected: false }), { kind: "soon" });
  assert.deepEqual(wa({ catalog: null, signupConfigured: false }), { kind: "connect" }, "a number connected another way can still connect the catalog");
  assert.deepEqual(wa({ whatsappConnected: false }), { kind: "reauth" });
  assert.deepEqual(wa({ catalog: { catalogId: "c1", lastSyncAt: null, lastSyncStatus: null, syncing: false } }), { kind: "syncing" });
  assert.deepEqual(wa({ catalog: { catalogId: "c1", lastSyncAt: new Date(), lastSyncStatus: "error", syncing: false } }), { kind: "error" });
  const noPermission = { catalogId: null, lastSyncAt: null, lastSyncStatus: null, syncing: false, permissionMissing: true };
  assert.deepEqual(wa({ catalog: noPermission }), { kind: "needs_account" }, "number connected, catalog permissions missing: say so, not Connect");
  assert.deepEqual(wa({ catalog: noPermission, whatsappConnected: false }), { kind: "connect" });
});

test("the page lists live platforms in the order Nigerian sellers use them, then coming soon", () => {
  assert.deepEqual([...sc.LIVE_PLATFORMS], ["whatsapp", "meta", "tiktok", "google"]);
  for (const platform of ["amazon", "jumia", "konga", "jiji", "ebay", "etsy", "shopify", "pinterest", "snapchat"]) assert.ok(sc.isComingSoon(platform), platform);
  assert.equal(sc.isComingSoon("meta"), false);
  const server = read("src/lib/sales-channels/server.ts");
  assert.match(server, /const order: LivePlatform\[\] = \["whatsapp", "meta", "tiktok", "google"\];/);
});

// ─── OAuth state / CSRF ─────────────────────────────────────────────────────

test("OAuth state: signed, fresh, for this platform, this store and this browser's nonce", () => {
  const key = randomBytes(32);
  const now = 1_800_000_000_000;
  const nonce = sc.newNonce();
  const state = sc.signState({ storeId: "store_1", platform: "google", nonce, iat: now }, key);
  const expect = { platform: "google", storeId: "store_1", nonceCookie: nonce };

  assert.deepEqual(sc.readState(state, key, now + 1000), { storeId: "store_1", platform: "google", nonce, iat: now });
  assert.ok(sc.checkCallbackState(state, expect, key, now + 1000));

  assert.equal(sc.checkCallbackState(state, { ...expect, nonceCookie: sc.newNonce() }, key, now), null, "another browser's cookie");
  assert.equal(sc.checkCallbackState(state, { ...expect, nonceCookie: undefined }, key, now), null, "no cookie");
  assert.equal(sc.checkCallbackState(state, { ...expect, storeId: "store_2" }, key, now), null, "signed in as another store");
  assert.equal(sc.checkCallbackState(state, { ...expect, platform: "meta" }, key, now), null, "a Google state on the Meta callback");
  assert.equal(sc.checkCallbackState(state, expect, randomBytes(32), now), null, "another server key");
  assert.equal(sc.checkCallbackState(state, expect, key, now + sc.STATE_MAX_AGE_MS + 1), null, "expired");

  const [payload, sig] = state.split(".");
  const forged = Buffer.from(JSON.stringify({ s: "store_2", p: "google", n: nonce, t: now })).toString("base64url");
  assert.equal(sc.readState(`${forged}.${sig}`, key, now), null, "payload swapped under the old signature");
  assert.equal(sc.readState(`${payload}.${sig}x`, key, now), null);
  assert.equal(sc.readState(`${payload}`, key, now), null);
  assert.equal(sc.readState("", key, now), null);
  assert.equal(sc.readState(null, key, now), null);

  const tiktok = sc.signState({ storeId: "s", platform: "pinterest", nonce, iat: now }, key);
  assert.equal(sc.readState(tiktok, key, now), null, "only OAuth platforms");
});

test("connect sets an httpOnly nonce cookie; the callback checks it with the signed state", () => {
  const connect = read("src/app/api/app/sales-channels/[platform]/connect/route.ts");
  assert.match(connect, /withSeller/);
  assert.match(connect, /response\.cookies\.set\(nonceCookieName\(platform\), started\.nonce, \{\s*httpOnly: true,/);
  assert.match(connect, /sameSite: "lax"/);
  const callback = read("src/app/api/app/sales-channels/[platform]/callback/route.ts");
  assert.match(callback, /withSeller/);
  assert.match(callback, /checkCallbackState\(query\.get\("state"\), \{ platform, storeId: store\?\.id, nonceCookie: cookie \}, key\)/);
  // The code is only exchanged after the state check.
  assert.ok(callback.indexOf("checkCallbackState(") < callback.indexOf("finishConnect("));
  assert.match(callback, /maxAge: 0/, "the nonce is single use");
});

test("sign-in URLs carry the state and the registered redirect URI", () => {
  const origin = "https://app.shopinbos.com";
  const google = new URL(sc.authorizeUrl("google", { origin, state: "st", env: FULL }));
  assert.equal(google.origin + google.pathname, "https://accounts.google.com/o/oauth2/v2/auth");
  assert.equal(google.searchParams.get("scope"), sc.GOOGLE_SCOPE, "one Google sign-in asks for everything Google");
  assert.equal(google.searchParams.get("access_type"), "offline");
  assert.equal(google.searchParams.get("redirect_uri"), "https://app.shopinbos.com/api/app/sales-channels/google/callback");
  assert.equal(google.searchParams.get("state"), "st");
  assert.equal(google.searchParams.get("client_id"), "g-id");

  const meta = new URL(sc.authorizeUrl("meta", { origin: `${origin}/`, state: "st", env: FULL, graphVersion: "v21.0" }));
  assert.equal(meta.origin + meta.pathname, "https://www.facebook.com/v21.0/dialog/oauth");
  assert.equal(meta.searchParams.get("config_id"), "cat-config");
  assert.equal(meta.searchParams.get("response_type"), "code");
  assert.equal(meta.searchParams.get("redirect_uri"), "https://app.shopinbos.com/api/app/sales-channels/meta/callback");
  assert.equal(meta.searchParams.get("scope"), null, "a configuration carries its own permissions");
  const inboxConfig = new URL(sc.authorizeUrl("meta", { origin, state: "st", env: { ...FULL, META_CATALOG_CONFIG_ID: "", META_INBOX_CONFIG_ID: "inbox-config" } }));
  assert.equal(inboxConfig.searchParams.get("config_id"), "inbox-config", "no catalog configuration: the inbox's, never the scope dialog a Business app rejects");
  assert.equal(inboxConfig.searchParams.get("scope"), null);
  const classic = new URL(sc.authorizeUrl("meta", { origin, state: "st", env: { ...FULL, META_CATALOG_CONFIG_ID: "", META_INBOX_CONFIG_ID: "" } }));
  assert.equal(classic.searchParams.get("config_id"), null);
  assert.equal(classic.searchParams.get("scope"), sc.META_LOGIN_SCOPES.join(","));
  assert.equal(classic.searchParams.get("response_type"), "code");

  const tiktok = new URL(sc.authorizeUrl("tiktok", { origin, state: "st", env: FULL }));
  assert.equal(tiktok.origin + tiktok.pathname, "https://business-api.tiktok.com/portal/auth");
  assert.equal(tiktok.searchParams.get("app_id"), "tt-id");
  assert.equal(tiktok.searchParams.get("redirect_uri"), "https://app.shopinbos.com/api/app/sales-channels/tiktok/callback");
});

// ─── Tokens ─────────────────────────────────────────────────────────────────

test("tokens are stored encrypted and read back; a wrong key or old shape reads as nothing", () => {
  const key = crypto.credentialKey({ INBOX_ENCRYPTION_KEY: "a".repeat(64) });
  const sealed = crypto.encryptJson({ token: "ya29.secret", refreshToken: "1//refresh" }, key);
  assert.doesNotMatch(sealed, /ya29|refresh/);
  assert.deepEqual(sc.readTokens(crypto.decryptJson(sealed, key)), { token: "ya29.secret", refreshToken: "1//refresh" });
  assert.equal(crypto.decryptJson(sealed, crypto.credentialKey({ INBOX_ENCRYPTION_KEY: "b".repeat(64) })), null);
  assert.deepEqual(sc.readTokens({ token: "EAAG" }), { token: "EAAG" }, "rows from the pasted-token form");
  assert.equal(sc.readTokens({ token: "" }), null);
  assert.equal(sc.readTokens(null), null);
  assert.throws(() => crypto.encryptJson({ token: "x" }, null), /INBOX_ENCRYPTION_KEY/);

  const now = Date.now();
  assert.equal(sc.needsRefresh(new Date(now + 30_000), now), true);
  assert.equal(sc.needsRefresh(new Date(now + 10 * 60_000), now), false);
  assert.equal(sc.needsRefresh(null, now), false, "tokens without an expiry");
  assert.equal(sc.isAuthProblem("invalid_grant: Token has been expired or revoked."), true);
  assert.equal(sc.isAuthProblem("Error validating access token: Session has expired"), true);
  assert.equal(sc.isAuthProblem("Couldn't reach Google. Try again."), false);
});

// ─── Feed registration ──────────────────────────────────────────────────────

test("feed registration requests: daily fetch of our keyed feed URL, Lagos time", () => {
  const feed = "https://app.shopinbos.com/api/public/feeds/ada/google.xml?token=k";
  assert.deepEqual(sc.googleDataSourceBody(feed, "Ada's Shop"), {
    displayName: "Shopinbos: Ada's Shop",
    primaryProductDataSource: { contentLanguage: "en", feedLabel: "NG", countries: ["NG"] },
    fileInput: {
      fileName: "shopinbos-google.xml",
      fetchSettings: { enabled: true, frequency: "FREQUENCY_DAILY", timeOfDay: { hours: 3 }, timeZone: "Africa/Lagos", fetchUri: feed },
    },
  });
  assert.deepEqual(sc.metaFeedBody("https://x/meta.csv", "Ada's Shop"), { name: "Shopinbos: Ada's Shop", schedule: { interval: "DAILY", url: "https://x/meta.csv", hour: 3 } });
  assert.deepEqual(sc.metaCatalogBody("Ada's Shop"), { name: "Ada's Shop (Shopinbos)", vertical: "commerce" });
  assert.deepEqual(sc.tiktokCatalogBody("bc1", "Ada's Shop"), { bc_id: "bc1", catalog_name: "Ada's Shop (Shopinbos)", catalog_type: "ECOM", catalog_conf: { region_code: "NG", currency: "NGN" } });
  assert.deepEqual(sc.tiktokFeedBody("bc1", "cat1", "https://x/tiktok.csv", "Ada's Shop"), {
    bc_id: "bc1",
    catalog_id: "cat1",
    feed_name: "Shopinbos: Ada's Shop",
    update_mode: "OVERWRITE",
    schedule_param: { source: { uri: "https://x/tiktok.csv" }, interval_type: "DAILY", timezone: "Africa/Lagos", hour: 3, minute: 0 },
  });
  assert.equal(sc.metaCatalogBody("").name, "My shop (Shopinbos)");

  const providers = read("src/lib/sales-channels/providers.ts");
  assert.match(providers, /datasources\/v1\/accounts\/\$\{encodeURIComponent\(accountId\)\}\/dataSources/);
  assert.match(providers, /product_feeds`, token, \{ body: metaFeedBody\(ctx\.feedUrl\("meta\.csv"\)/);
  assert.match(providers, /catalog\/feed\/create\/", token, \{ body: tiktokFeedBody\(bcId, catalogId, ctx\.feedUrl\("tiktok\.csv"\)/);
  assert.match(providers, /googleDataSourceBody\(ctx\.feedUrl\("google\.xml"\)/);
});

// ─── Coming soon ────────────────────────────────────────────────────────────

test("'Tell me when it's ready' records one row per store and platform, coming-soon platforms only", () => {
  const actions = read("src/app/channels/actions.ts");
  assert.match(actions, /const soon = z\.enum\(COMING_SOON_PLATFORMS\);/);
  assert.match(actions, /export async function notifyMeAction\(platform: string\)[\s\S]*soon\.safeParse\(platform\)[\s\S]*recordInterest\(me\.store\.id, me\.user\.id, parsed\.data\)/);
  const server = read("src/lib/sales-channels/server.ts");
  assert.match(server, /salesChannelInterest\.upsert\(\{\s*where: \{ storeId_platform: \{ storeId, platform \} \}/);
  assert.match(read("prisma/schema.prisma"), /model SalesChannelInterest \{[\s\S]*@@unique\(\[storeId, platform\]\)/);
  const migration = read("docs/migrations/2026-10-22-sales-channels.sql");
  assert.match(migration, /CREATE TABLE IF NOT EXISTS "SalesChannelInterest"/);
  assert.match(migration, /ALTER TABLE "SalesChannelInterest" ENABLE ROW LEVEL SECURITY;/);
  assert.match(migration, /ADD COLUMN IF NOT EXISTS "productCount" INTEGER/);
});

test("the sync cron needs the cron secret", () => {
  const cron = read("src/app/api/cron/sales-channels/route.ts");
  assert.match(cron, /const denied = await cronDenied\(req\);\n  if \(denied\) return denied;/, "the cron secret or a signed QStash call");
  assert.match(cron, /syncDueConnections\(\)/);
});

test("Connect returns to the page it started on, and only to our own pages", () => {
  for (const path of ["/channels", "/home/inbox/channels", "/home/start"]) assert.equal(sc.safeReturnPath(path), path);
  for (const bad of ["https://evil.example/channels", "//evil.example", "/channels/../admin", "/home", "", null, undefined]) assert.equal(sc.safeReturnPath(bad), null, String(bad));
  const connect = read("src/app/api/app/sales-channels/[platform]/connect/route.ts");
  assert.match(connect, /safeReturnPath\(req\.nextUrl\.searchParams\.get\("next"\)\)/);
  assert.match(connect, /returnCookieName\(platform\), next, \{ httpOnly: true/);
  const callback = read("src/app/api/app/sales-channels/[platform]/callback/route.ts");
  assert.match(callback, /safeReturnPath\(req\.cookies\.get\(returnCookieName\(platform\)\)\?\.value\) \?\? "\/channels"/);
});

test("TikTok is coming soon in Nigeria: its card hides unless a store linked it before", () => {
  assert.equal(sc.COMING_SOON_PLATFORMS[0], "tiktok");
  assert.ok(sc.PAUSED_PLATFORMS.includes("tiktok"));
  assert.equal(sc.channelActionAllowed("tiktok", "notify"), true, "Tell me when it's ready works for TikTok");
  const server = read("src/lib/sales-channels/server.ts");
  assert.match(server, /!PAUSED_PLATFORMS\.includes\(card\.platform\) \|\| Boolean\(byPlatform\.get\(card\.platform\)\?\.tokenEnc\)/);
});

test("one Facebook sign-in also connects the Page and Instagram inboxes, and Disconnect turns off only those", () => {
  const server = read("src/lib/sales-channels/server.ts");
  assert.match(server, /if \(platform === "meta"\) \{\n\s+const store = await loadStore\(storeId\);\n\s+if \(store\) await connectMetaInbox\(store, exchanged\.tokens\.token\);/);
  assert.match(server, /if \(platform === "meta"\) await disconnectMetaInbox\(storeId\);/);
  const inbox = read("src/lib/sales-channels/meta-inbox.server.ts");
  assert.match(inbox, /connectChannel\(store, channel, \{ pageAccessToken: page\.token \}\)/);
  assert.match(inbox, /via === VIA_FACEBOOK_LOGIN\) await disconnectChannel/);
  assert.doesNotMatch(inbox, /console\.[a-z]+\([^)]*token/i, "tokens never reach a log line");
});

test("Connect Google: one client and one set of scopes for shopping, reviews, search and visitor stats", async () => {
  const g = await import("../src/lib/google/oauth.ts");
  assert.deepEqual([...g.GOOGLE_CONNECT_SCOPES], [
    "openid",
    "email",
    "https://www.googleapis.com/auth/content",
    "https://www.googleapis.com/auth/business.manage",
    "https://www.googleapis.com/auth/webmasters",
    "https://www.googleapis.com/auth/siteverification",
    "https://www.googleapis.com/auth/analytics.edit",
  ]);
  assert.ok(!g.GOOGLE_CONNECT_SCOPES.some((scope) => scope.includes("gmail")), "Gmail asks separately, from the email card");
  const shared = { GOOGLE_CLIENT_ID: "shared", GOOGLE_CLIENT_SECRET: "s", GOOGLE_MERCHANT_CLIENT_ID: "old", GOOGLE_MERCHANT_CLIENT_SECRET: "o" };
  for (const feature of ["merchant", "business", "searchConsole"]) assert.deepEqual(g.googleClient(feature, shared), { id: "shared", secret: "s" }, feature);
  assert.deepEqual(g.googleClient("merchant", { GOOGLE_MERCHANT_CLIENT_ID: "old", GOOGLE_MERCHANT_CLIENT_SECRET: "o" }), { id: "old", secret: "o" }, "older clients still work alone");
  assert.deepEqual(g.googleClient("business", { GOOGLE_BUSINESS_CLIENT_ID: "b", GOOGLE_BUSINESS_CLIENT_SECRET: "bs" }), { id: "b", secret: "bs" });
  assert.equal(sc.platformConfigured("google", { INBOX_ENCRYPTION_KEY: KEY, GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "y" }), true, "the shared client is enough");
  const server = read("src/lib/sales-channels/server.ts");
  assert.match(server, /if \(platform === "google"\) await connectGoogleEverything\(storeId, tokens, exchanged\.expiresAt\);/);
  assert.match(server, /if \(platform === "google"\) await disconnectGoogleEverything\(storeId\);/);
  const connect = read("src/lib/google/connect.server.ts");
  assert.match(connect, /"https:\/\/www\.googleapis\.com\/siteVerification\/v1"/);
  assert.match(connect, /\$\{VERIFY_API\}\/token`, \{ body: \{ site, verificationMethod: "META" \} \}/);
  assert.match(connect, /setStoreIntegration\(store\.id, "gaSiteVerification", code\)/);
  assert.match(connect, /setStoreIntegration\(store\.id, "googleAnalyticsId", measurementId, \{ onlyIfEmpty: true \}\)/);
  assert.doesNotMatch(connect, /console\.[a-z]+\([^)]*token/i, "tokens never reach a log line");
});
