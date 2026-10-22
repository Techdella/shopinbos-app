import "server-only";

import { db } from "@/lib/db/client";
import { appOrigin } from "@/lib/ads";
import { recordMetaUser } from "@/lib/meta/user-links.server";
import { credentialKey, decryptJson, encryptJson } from "@/lib/inbox/crypto";
import { buildStoreFeed, feedUrl } from "@/lib/social/server";
import { createCatalog, disconnectCatalog, ensureCatalogRow, itemCounts, listCatalogs, selectCatalog, syncCatalog } from "@/lib/whatsapp-catalog/server";
import { ChannelError, GRAPH_VERSION, PROVIDERS, type ProviderContext, type StoreRef } from "./providers";
import { connectMetaInbox, disconnectMetaInbox, pickMetaPixel } from "./meta-inbox.server";
import { connectGoogleEverything, disconnectGoogleEverything } from "@/lib/google/connect.server";
import {
  authorizeUrl,
  cardState,
  COMING_SOON_PLATFORMS,
  isAuthProblem,
  needsRefresh,
  newNonce,
  OAUTH_PLATFORMS,
  PAUSED_PLATFORMS,
  platformConfigured,
  readTokens,
  signState,
  whatsappCardState,
  type CardState,
  type ComingSoonPlatform,
  type LivePlatform,
  type OAuthPlatform,
  type StoredTokens,
} from "./pure";

// Sell everywhere, server side: start and finish a platform's sign-in, set up its catalog and feed, keep a product
// count, disconnect, and "Tell me when it's ready" for coming-soon platforms. The WhatsApp card reuses the WhatsApp
// catalog (src/lib/whatsapp-catalog) on the store's connected WhatsApp number.

const SYNC_EVERY_MS = 6 * 60 * 60_000;
const FIRST_DAY_MS = 24 * 60 * 60_000;
const LOCK_MS = 10 * 60_000;

async function loadStore(storeId: string): Promise<StoreRef | null> {
  return db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, customDomain: true, currency: true } });
}

function findRow(storeId: string, platform: OAuthPlatform) {
  return db.socialChannelConnection.findUnique({ where: { storeId_channel: { storeId, channel: platform } } });
}

// ─── Connect ────────────────────────────────────────────────────────────────

/** The URL to send the seller to, and the nonce for the httpOnly cookie that proves the callback is theirs. */
export function startConnect(storeId: string, platform: OAuthPlatform): { url: string; nonce: string } | null {
  const key = credentialKey();
  if (!key || !platformConfigured(platform)) return null;
  const nonce = newNonce();
  const state = signState({ storeId, platform, nonce, iat: Date.now() }, key);
  return { url: authorizeUrl(platform, { origin: appOrigin(), state, graphVersion: GRAPH_VERSION }), nonce };
}

/** The platform sent the seller back with a code: keep the tokens (encrypted) and set everything up. */
export async function finishConnect(storeId: string, platform: OAuthPlatform, code: string): Promise<CardState["kind"]> {
  const exchanged = await PROVIDERS[platform].exchange(code, appOrigin());
  if (platform === "meta") await recordMetaUser(storeId, "sales_meta", exchanged.tokens.token);
  const previous = await findRow(storeId, platform);
  // Google sends a refresh token only on first consent; keep the one we had.
  const refreshToken = exchanged.tokens.refreshToken ?? readTokens(decryptJson(previous?.tokenEnc))?.refreshToken;
  const tokens: StoredTokens = { token: exchanged.tokens.token, ...(refreshToken ? { refreshToken } : {}) };
  const data = {
    tokenEnc: encryptJson(tokens),
    tokenExpiresAt: exchanged.expiresAt,
    status: "syncing",
    connectedAt: new Date(),
    lastSyncStatus: null,
    lastSyncMessage: null,
  };
  await db.socialChannelConnection.upsert({
    where: { storeId_channel: { storeId, channel: platform } },
    create: { storeId, channel: platform, ...data },
    update: data,
  });
  // The same sign-in brings the seller's Facebook Page and Instagram messages into the inbox.
  if (platform === "meta") {
    const store = await loadStore(storeId);
    if (store) await connectMetaInbox(store, exchanged.tokens.token);
  }
  // One Google sign-in: reviews, search and visitor stats too (src/lib/google/connect.server.ts).
  if (platform === "google") await connectGoogleEverything(storeId, tokens, exchanged.expiresAt);
  const outcome = await syncPlatform(storeId, platform);
  // The Facebook pixel for the store's visitor and ads stats, from the business the catalog uses.
  if (platform === "meta") {
    const row = await findRow(storeId, platform);
    if (row?.accountId) await pickMetaPixel(storeId, row.accountId, exchanged.tokens.token);
  }
  return outcome;
}

async function feedKey(storeId: string) {
  return (await ensureCatalogRow(storeId)).feedToken;
}

/** Sets up what's missing (account, catalog, feed) and refreshes the product count. Never throws. */
export async function syncPlatform(storeId: string, platform: OAuthPlatform): Promise<CardState["kind"]> {
  const [row, store] = await Promise.all([findRow(storeId, platform), loadStore(storeId)]);
  if (!row?.tokenEnc || !store) return "connect";
  let tokens = readTokens(decryptJson(row.tokenEnc));
  if (!tokens) {
    await db.socialChannelConnection.update({ where: { id: row.id }, data: { status: "reauth", lastSyncStatus: "error", lastSyncMessage: "Stored sign-in couldn't be read." } });
    return "reauth";
  }
  const provider = PROVIDERS[platform];
  try {
    let expiresAt = row.tokenExpiresAt;
    if (needsRefresh(expiresAt)) {
      if (!provider.refresh) throw new ChannelError("The sign-in ran out.", true);
      const fresh = await provider.refresh(tokens);
      tokens = fresh.tokens;
      expiresAt = fresh.expiresAt;
      await db.socialChannelConnection.update({ where: { id: row.id }, data: { tokenEnc: encryptJson(tokens), tokenExpiresAt: expiresAt } });
    }
    const key = await feedKey(storeId);
    const ctx: ProviderContext = {
      store,
      tokens,
      accountId: row.accountId,
      catalogId: row.externalId,
      feedId: row.feedId,
      feedUrl: (file) => feedUrl(store.slug, file, key),
    };
    const setup = await provider.setup(ctx);
    if (setup.needsAccount) {
      await db.socialChannelConnection.update({ where: { id: row.id }, data: { status: "needs_account", lastSyncAt: new Date(), lastSyncStatus: null, lastSyncMessage: null } });
      return "needs_account";
    }
    Object.assign(ctx, { accountId: setup.accountId, catalogId: setup.catalogId, feedId: setup.feedId });
    await db.socialChannelConnection.update({ where: { id: row.id }, data: { accountId: setup.accountId, externalId: setup.catalogId, feedId: setup.feedId } });
    const { productCount } = await provider.sync(ctx);
    // Right after connecting, platforms take a while to take in the feed: say "Syncing…" rather than "0 products".
    const listed = productCount === 0 ? (await buildStoreFeed(store, platform)).items.length : 0;
    const young = Boolean(row.connectedAt && Date.now() - row.connectedAt.getTime() < FIRST_DAY_MS);
    const status = productCount === 0 && listed > 0 && young ? "syncing" : "connected";
    await db.socialChannelConnection.update({
      where: { id: row.id },
      data: { status, productCount, lastSyncAt: new Date(), lastSyncStatus: "ok", lastSyncMessage: null },
    });
    return status;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const auth = (error instanceof ChannelError && error.auth) || isAuthProblem(message);
    console.error(`[sales-channels] ${platform} sync failed`, message.slice(0, 200));
    await db.socialChannelConnection.update({
      where: { id: row.id },
      data: { status: auth ? "reauth" : "error", lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncMessage: message.slice(0, 500) },
    });
    return auth ? "reauth" : "error";
  }
}

export async function disconnectPlatform(storeId: string, platform: LivePlatform) {
  if (platform === "whatsapp") {
    await disconnectCatalog(storeId);
    return;
  }
  if (platform === "meta") await disconnectMetaInbox(storeId);
  if (platform === "google") await disconnectGoogleEverything(storeId);
  const [row, store] = await Promise.all([findRow(storeId, platform), loadStore(storeId)]);
  if (!row) return;
  const tokens = readTokens(decryptJson(row.tokenEnc));
  if (tokens && store) {
    await PROVIDERS[platform]
      .remove({ store, tokens, accountId: row.accountId, catalogId: row.externalId, feedId: row.feedId, feedUrl: () => "" })
      .catch(() => undefined);
  }
  await db.socialChannelConnection.update({
    where: { id: row.id },
    data: { tokenEnc: null, tokenExpiresAt: null, status: null, accountId: null, externalId: null, feedId: null, productCount: null, connectedAt: null, lastSyncAt: null, lastSyncStatus: null, lastSyncMessage: null },
  });
}

// ─── WhatsApp ───────────────────────────────────────────────────────────────

/** permission: the number is connected but Meta didn't grant the catalog permissions (the card explains it). */
export type WhatsAppConnectResult = { ok: true } | { ok: false; needsSignup: true } | { ok: false; error: string; permission?: boolean };

/**
 * One tap: on the store's connected WhatsApp number, use the catalog they already have (or ours from before), or
 * create one, link it to the number with the cart on, and send every product.
 */
export async function connectWhatsAppCatalog(storeId: string): Promise<WhatsAppConnectResult> {
  const channel = await db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel: "whatsapp" } }, select: { status: true } });
  if (channel?.status !== "connected") return { ok: false, needsSignup: true };
  const store = await loadStore(storeId);
  if (!store) return { ok: false, error: "No store" };
  const row = await ensureCatalogRow(storeId);
  if (!row.catalogId) {
    // A failure because Meta didn't grant the catalog permissions is flagged, so the card explains it.
    const failed = async (error: string) => {
      const latest = await ensureCatalogRow(storeId).catch(() => null);
      return { ok: false as const, error, ...(latest?.permissionState === "missing" ? { permission: true } : {}) };
    };
    const listed = await listCatalogs(storeId);
    if ("error" in listed) return failed(listed.error);
    const pick = listed.catalogs.find((item) => item.name === store.name) ?? listed.catalogs[0];
    const chosen = pick ? await selectCatalog(storeId, pick.id, pick.name) : await createCatalog(storeId, store.name);
    if (!chosen.ok) return failed(chosen.error);
  }
  const summary = await syncCatalog(storeId, { manual: true });
  if (summary.status === "error") return { ok: false, error: summary.message ?? "Sync failed" };
  return { ok: true };
}

// ─── Coming soon ────────────────────────────────────────────────────────────

export async function recordInterest(storeId: string, userId: string | null, platform: ComingSoonPlatform) {
  await db.salesChannelInterest.upsert({
    where: { storeId_platform: { storeId, platform } },
    create: { storeId, platform, userId },
    update: {},
  });
}

// ─── The page ───────────────────────────────────────────────────────────────

export interface ChannelCardView {
  platform: LivePlatform;
  state: CardState;
  /** Google Merchant Center / Meta business / TikTok Business Center sign-up page, when they need one first. */
  accountUrl: string | null;
  /** What's connected, by name: the WhatsApp number, the Facebook Page and the Instagram account (null when not). */
  accounts: { whatsapp: string | null; facebook: string | null; instagram: string | null };
}

const ACCOUNT_URL: Record<OAuthPlatform, string> = {
  meta: "https://business.facebook.com/overview",
  google: "https://merchants.google.com/",
  tiktok: "https://business.tiktok.com/",
};

export async function channelCards(storeId: string): Promise<{ cards: ChannelCardView[]; interest: ComingSoonPlatform[]; saved: boolean }> {
  const [rows, interestRows, catalog, inbox, counts] = await Promise.all([
    db.socialChannelConnection.findMany({ where: { storeId }, select: { channel: true, status: true, tokenEnc: true, productCount: true, lastSyncStatus: true } }).catch(() => null),
    db.salesChannelInterest.findMany({ where: { storeId }, select: { platform: true } }).catch(() => []),
    ensureCatalogRow(storeId).catch(() => null),
    db.inboxChannel.findMany({ where: { storeId, channel: { in: ["whatsapp", "messenger", "instagram"] } }, select: { channel: true, status: true, displayName: true } }).catch(() => []),
    itemCounts(storeId).catch(() => null),
  ]);
  const byPlatform = new Map((rows ?? []).map((row) => [row.channel, row]));
  const named = (channel: string) => {
    const row = inbox.find((item) => item.channel === channel && item.status === "connected");
    return row ? row.displayName || channel : null;
  };
  const accounts = { whatsapp: named("whatsapp"), facebook: named("messenger"), instagram: named("instagram") };
  const waChannel = inbox.find((item) => item.channel === "whatsapp") ?? null;
  const whatsapp: ChannelCardView = {
    platform: "whatsapp",
    accountUrl: null,
    accounts,
    state: whatsappCardState({
      signupConfigured: platformConfigured("whatsapp"),
      whatsappConnected: waChannel?.status === "connected",
      catalog: catalog
        ? { catalogId: catalog.catalogId, lastSyncAt: catalog.lastSyncAt, lastSyncStatus: catalog.lastSyncStatus, syncing: Boolean(catalog.syncStartedAt && catalog.syncStartedAt.getTime() > Date.now() - LOCK_MS), permissionMissing: catalog.permissionState === "missing" }
        : null,
      synced: counts?.synced ?? 0,
    }),
  };
  const oauth = OAUTH_PLATFORMS.map((platform): ChannelCardView => ({
    platform,
    accountUrl: ACCOUNT_URL[platform],
    accounts,
    state: cardState(platformConfigured(platform), byPlatform.get(platform) ?? null),
  }));
  const order: LivePlatform[] = ["whatsapp", "meta", "tiktok", "google"];
  // A paused platform (TikTok) only shows for a store that linked it before, so they can still disconnect.
  const cards = [whatsapp, ...oauth]
    .filter((card) => !PAUSED_PLATFORMS.includes(card.platform) || Boolean(byPlatform.get(card.platform)?.tokenEnc))
    .sort((a, b) => order.indexOf(a.platform) - order.indexOf(b.platform));
  const interest = interestRows.map((row) => row.platform).filter((p): p is ComingSoonPlatform => (COMING_SOON_PLATFORMS as readonly string[]).includes(p));
  return { cards, interest, saved: rows !== null };
}

// ─── Cron ───────────────────────────────────────────────────────────────────

/** Connected platforms not synced for 6 hours: refresh tokens, counts and instant pushes. */
export async function syncDueConnections(limit = 40) {
  const due = await db.socialChannelConnection.findMany({
    where: {
      channel: { in: [...OAUTH_PLATFORMS] },
      tokenEnc: { not: null },
      status: { in: ["connected", "syncing", "error"] },
      OR: [{ lastSyncAt: null }, { lastSyncAt: { lt: new Date(Date.now() - SYNC_EVERY_MS) } }],
    },
    orderBy: { lastSyncAt: { sort: "asc", nulls: "first" } },
    take: limit,
    select: { storeId: true, channel: true, tokenExpiresAt: true, id: true },
  });
  const results: Record<string, number> = {};
  for (const row of due) {
    const platform = row.channel as OAuthPlatform;
    let outcome: string;
    // A Meta user token can't be renewed without the seller; past its date it's "Connect again".
    if (platform !== "google" && row.tokenExpiresAt && row.tokenExpiresAt.getTime() < Date.now()) {
      await db.socialChannelConnection.update({ where: { id: row.id }, data: { status: "reauth", lastSyncAt: new Date(), lastSyncStatus: "error", lastSyncMessage: "Sign-in expired" } });
      outcome = "reauth";
    } else {
      outcome = await syncPlatform(row.storeId, platform);
    }
    results[outcome] = (results[outcome] ?? 0) + 1;
  }
  return { checked: due.length, results };
}
