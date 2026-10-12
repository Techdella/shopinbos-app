import "server-only";

import { db } from "@/lib/db/client";
import { appOrigin } from "@/lib/ads";
import { getChannel } from "@/lib/inbox/service";
import { whatsappError } from "@/lib/inbox/channels/whatsapp";
import { buildFeedItems, type FeedBuild } from "@/lib/social/feeds";
import { loadFeedProducts, productLink } from "@/lib/social/server";
import { storeUnavailableReason } from "@/lib/storefront/store-visibility";
import { debugToken, graph } from "./graph";
import {
  catalogFeedPath,
  chunk,
  countItems,
  generateFeedToken,
  grantedTargets,
  itemsBatchBody,
  missingPermissions,
  parseBatchResponse,
  parseBatchStatus,
  planSync,
  productMessagePayload,
  REQUIRED_PERMISSIONS,
  type ItemCounts,
  type ProductMessageOptions,
} from "./pure";

// WhatsApp catalog, server side: the store's feed token, the Graph API catalog sync, and product messages.
// Credentials come from the store's connected WhatsApp channel (encrypted on InboxChannel) and never leave the
// server or reach a log line.

const BATCH_SIZE = 500;
const LOCK_MS = 10 * 60_000;
const RECHECK_MS = 6 * 60 * 60_000;

type StoreRef = { id: string; name: string; slug: string; customDomain: string | null; currency: string };

// ─── Store, feed and credentials ─────────────────────────────────────────────

export async function loadStore(storeId: string): Promise<StoreRef | null> {
  return db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, customDomain: true, currency: true } });
}

/** The same "is the store live" test the storefront, product pages and checkout use. */
export async function storeIsLive(store: { id: string; status: string; brandSettings: unknown }) {
  const pages = await db.storePage.count({ where: { storeId: store.id, isPublished: true } });
  return storeUnavailableReason(store, pages) === null;
}

/** Published products in the store's currency (what the storefront sells), mapped to Meta's fields. */
export async function buildCatalogItems(store: StoreRef): Promise<FeedBuild> {
  const products = (await loadFeedProducts(store.id)).filter((product) => (product.currency || "NGN").toUpperCase() === (store.currency || "NGN").toUpperCase());
  return buildFeedItems(products, { channel: "whatsapp", brand: store.name, productUrl: (id) => productLink(store, id), appOrigin: appOrigin() });
}

export async function getCatalogRow(storeId: string) {
  return db.whatsAppCatalog.findUnique({ where: { storeId } });
}

/** The store's catalog row, created with a fresh feed token the first time. */
export async function ensureCatalogRow(storeId: string) {
  const existing = await getCatalogRow(storeId);
  if (existing) return existing;
  return db.whatsAppCatalog.upsert({ where: { storeId }, create: { storeId, feedToken: generateFeedToken() }, update: {} });
}

export async function rotateFeedToken(storeId: string) {
  await ensureCatalogRow(storeId);
  return db.whatsAppCatalog.update({ where: { storeId }, data: { feedToken: generateFeedToken(), feedTokenRotatedAt: new Date() } });
}

export function catalogFeedUrl(slug: string, token: string) {
  return `${appOrigin()}${catalogFeedPath(slug, token)}`;
}

interface Creds {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string | null;
}

async function whatsappCreds(storeId: string): Promise<Creds | null> {
  const channel = await getChannel(storeId, "whatsapp");
  if (!channel?.credentials.accessToken || !channel.credentials.phoneNumberId) return null;
  const settings = (channel.row.settings ?? {}) as Record<string, unknown>;
  const wabaId = channel.credentials.wabaId || (typeof settings.wabaId === "string" && settings.wabaId) || null;
  return { accessToken: channel.credentials.accessToken, phoneNumberId: channel.credentials.phoneNumberId, wabaId };
}

// ─── Permissions and accounts ────────────────────────────────────────────────

export interface PermissionCheck {
  state: "ok" | "missing" | "unknown";
  missing: string[];
  businessIds: string[];
  wabaIds: string[];
}

/** debug_token: does the token carry catalog_management and business_management? Saved on the row. */
export async function checkPermissions(storeId: string): Promise<PermissionCheck | { error: string }> {
  const creds = await whatsappCreds(storeId);
  if (!creds) return { error: "WhatsApp isn't connected." };
  const data = await debugToken(creds.accessToken);
  const missing = data ? missingPermissions(data) : null;
  const result: PermissionCheck = {
    state: missing === null ? "unknown" : missing.length ? "missing" : "ok",
    missing: missing ?? [],
    businessIds: grantedTargets(data, "business_management").concat(grantedTargets(data, "catalog_management")),
    wabaIds: grantedTargets(data, "whatsapp_business_management"),
  };
  await ensureCatalogRow(storeId);
  await db.whatsAppCatalog.update({ where: { storeId }, data: { permissionState: result.state, missingPermissions: result.missing, permissionsCheckedAt: new Date() } });
  return result;
}

async function notePermissionProblem(storeId: string, kind: string) {
  if (kind !== "permission") return;
  await db.whatsAppCatalog
    .update({ where: { storeId }, data: { permissionState: "missing", missingPermissions: [...REQUIRED_PERMISSIONS], permissionsCheckedAt: new Date() } })
    .catch(() => null);
}

/** The Meta business that owns the WhatsApp account (catalogs belong to a business). */
async function resolveBusinessId(storeId: string, creds: Creds, preferred?: string | null): Promise<{ businessId: string; wabaId: string | null } | { error: string }> {
  const row = await ensureCatalogRow(storeId);
  let wabaId = creds.wabaId || row.wabaId;
  let businessId = preferred || row.businessId;
  const data = businessId && wabaId ? null : await debugToken(creds.accessToken);
  if (!wabaId) wabaId = grantedTargets(data, "whatsapp_business_management")[0] ?? null;
  if (!businessId && wabaId) {
    const owner = await graph(encodeURIComponent(wabaId), creds.accessToken, { query: { fields: "owner_business_info" } });
    const info = owner.ok ? (owner.json.owner_business_info as { id?: string } | undefined) : undefined;
    if (info?.id) businessId = info.id;
    else if (!owner.ok) await notePermissionProblem(storeId, owner.error.kind);
  }
  if (!businessId) businessId = grantedTargets(data, "business_management")[0] ?? grantedTargets(data, "catalog_management")[0] ?? null;
  if (!businessId) return { error: "We couldn't find the Meta business that owns your WhatsApp number. Enter your Business ID (Meta Business Settings → Business info)." };
  await db.whatsAppCatalog.update({ where: { storeId }, data: { businessId, wabaId } });
  return { businessId, wabaId };
}

export interface CatalogOption {
  id: string;
  name: string;
  productCount: number | null;
}

export async function listCatalogs(storeId: string, businessIdInput?: string | null): Promise<{ catalogs: CatalogOption[]; businessId: string } | { error: string; permission?: boolean }> {
  const creds = await whatsappCreds(storeId);
  if (!creds) return { error: "WhatsApp isn't connected." };
  const business = await resolveBusinessId(storeId, creds, businessIdInput);
  if ("error" in business) return business;
  const res = await graph(`${encodeURIComponent(business.businessId)}/owned_product_catalogs`, creds.accessToken, { query: { fields: "id,name,product_count", limit: "100" } });
  if (!res.ok) {
    await notePermissionProblem(storeId, res.error.kind);
    return { error: res.error.message, permission: res.error.kind === "permission" };
  }
  const list = Array.isArray(res.json.data) ? (res.json.data as Array<Record<string, unknown>>) : [];
  return {
    businessId: business.businessId,
    catalogs: list
      .filter((item) => typeof item.id === "string")
      .map((item) => ({ id: item.id as string, name: typeof item.name === "string" ? item.name : (item.id as string), productCount: typeof item.product_count === "number" ? item.product_count : null })),
  };
}

type ActionResult = { ok: true; warnings: string[] } | { ok: false; error: string; permission?: boolean };

export async function createCatalog(storeId: string, name: string, businessIdInput?: string | null): Promise<ActionResult> {
  const creds = await whatsappCreds(storeId);
  if (!creds) return { ok: false, error: "WhatsApp isn't connected." };
  const business = await resolveBusinessId(storeId, creds, businessIdInput);
  if ("error" in business) return { ok: false, error: business.error };
  const res = await graph(`${encodeURIComponent(business.businessId)}/owned_product_catalogs`, creds.accessToken, { body: { name: name.slice(0, 100), vertical: "commerce" } });
  if (!res.ok) {
    await notePermissionProblem(storeId, res.error.kind);
    return { ok: false, error: res.error.message, permission: res.error.kind === "permission" };
  }
  const id = typeof res.json.id === "string" ? res.json.id : null;
  if (!id) return { ok: false, error: "Meta didn't return the new catalog's ID." };
  return selectCatalog(storeId, id, name);
}

/** Use this catalog: remember it, link it to the WhatsApp Business Account and switch the cart and catalog on. */
export async function selectCatalog(storeId: string, catalogId: string, knownName?: string): Promise<ActionResult> {
  const creds = await whatsappCreds(storeId);
  if (!creds) return { ok: false, error: "WhatsApp isn't connected." };
  const check = await graph(encodeURIComponent(catalogId), creds.accessToken, { query: { fields: "id,name" } });
  if (!check.ok) {
    await notePermissionProblem(storeId, check.error.kind);
    return { ok: false, error: check.error.message, permission: check.error.kind === "permission" };
  }
  const name = typeof check.json.name === "string" ? check.json.name : knownName ?? catalogId;
  const row = await ensureCatalogRow(storeId);
  if (row.catalogId !== catalogId) {
    // A different catalog starts empty: every product is sent again.
    await db.whatsAppCatalogItem.deleteMany({ where: { storeId } });
  }
  await db.whatsAppCatalog.update({
    where: { storeId },
    data: { catalogId, catalogName: name, permissionState: "ok", missingPermissions: [], dirty: true, dirtyAt: new Date(), wabaLinkedAt: row.catalogId === catalogId ? row.wabaLinkedAt : null, lastSyncError: null },
  });
  const linked = await linkCatalog(storeId);
  return { ok: true, warnings: linked.ok ? linked.warnings : [linked.error] };
}

/** POST /{WABA_ID}/product_catalogs, then the phone number's commerce settings (cart on, catalog visible). */
export async function linkCatalog(storeId: string): Promise<ActionResult> {
  const creds = await whatsappCreds(storeId);
  const row = await getCatalogRow(storeId);
  if (!creds || !row?.catalogId) return { ok: false, error: "Choose a catalog first." };
  const warnings: string[] = [];
  const wabaId = creds.wabaId || row.wabaId;
  let wabaLinkedAt = row.wabaLinkedAt;
  if (!wabaId) {
    warnings.push("We don't know your WhatsApp Business Account ID, so the catalog isn't linked to your number yet. Reconnect WhatsApp with the account ID, or link it in WhatsApp Manager → Catalog.");
  } else {
    const link = await graph(`${encodeURIComponent(wabaId)}/product_catalogs`, creds.accessToken, { body: { catalog_id: row.catalogId } });
    if (link.ok || /already/i.test(link.error.message)) wabaLinkedAt = new Date();
    else {
      await notePermissionProblem(storeId, link.error.kind);
      warnings.push(`Linking the catalog to your WhatsApp account failed: ${link.error.message}`);
    }
  }
  const settings = await graph(`${encodeURIComponent(creds.phoneNumberId)}/whatsapp_commerce_settings`, creds.accessToken, {
    method: "POST",
    query: { is_cart_enabled: "true", is_catalog_visible: "true" },
  });
  if (!settings.ok) warnings.push(`Switching on the cart and catalog failed: ${settings.error.message}`);
  await db.whatsAppCatalog.update({
    where: { storeId },
    data: {
      wabaId,
      wabaLinkedAt,
      ...(settings.ok ? { commerceSettingsAt: new Date(), cartEnabled: true, catalogVisible: true } : {}),
    },
  });
  return { ok: true, warnings };
}

/** Stop syncing (the catalog and its products stay in Meta; nothing is deleted there). */
export async function disconnectCatalog(storeId: string) {
  await db.whatsAppCatalogItem.deleteMany({ where: { storeId } });
  await db.whatsAppCatalog.updateMany({
    where: { storeId },
    data: { catalogId: null, catalogName: null, wabaLinkedAt: null, commerceSettingsAt: null, cartEnabled: false, catalogVisible: false, dirty: false, lastSyncAt: null, lastSyncStatus: null, lastSyncError: null, syncStartedAt: null },
  });
}

// ─── Sync ────────────────────────────────────────────────────────────────────

export interface SyncSummary {
  status: "ok" | "partial" | "error" | "busy" | "skipped";
  sent: number;
  unchanged: number;
  failed: number;
  pending: number;
  message: string | null;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Takes the store's sync lock (stale after 10 minutes) and clears the dirty flag, so edits made during the sync re-flag it. */
async function claim(storeId: string) {
  const now = new Date();
  const taken = await db.whatsAppCatalog.updateMany({
    where: { storeId, catalogId: { not: null }, OR: [{ syncStartedAt: null }, { syncStartedAt: { lt: new Date(now.getTime() - LOCK_MS) } }] },
    data: { syncStartedAt: now, dirty: false },
  });
  return taken.count === 1;
}

async function finish(storeId: string, summary: SyncSummary, retryLater: boolean) {
  await db.whatsAppCatalog.update({
    where: { storeId },
    data: {
      syncStartedAt: null,
      lastSyncAt: new Date(),
      lastSyncStatus: summary.status === "busy" || summary.status === "skipped" ? undefined : summary.status,
      lastSyncError: summary.message,
      ...(retryLater ? { dirty: true, dirtyAt: new Date() } : {}),
    },
  });
}

/** Checks Meta's answer for every batch still in flight and records per-product results. */
async function pollPending(storeId: string, catalogId: string, token: string, rounds: number) {
  for (let round = 0; round < rounds; round++) {
    const pending = await db.whatsAppCatalogItem.findMany({ where: { storeId, status: "pending", handle: { not: null } }, select: { handle: true }, distinct: ["handle"] });
    if (!pending.length) return;
    for (const { handle } of pending) {
      const res = await graph(`${encodeURIComponent(catalogId)}/check_batch_request_status`, token, { query: { handle: handle! } });
      if (!res.ok) {
        if (res.error.kind === "not_found") await db.whatsAppCatalogItem.updateMany({ where: { storeId, handle }, data: { handle: null } });
        continue;
      }
      const items = await db.whatsAppCatalogItem.findMany({ where: { storeId, handle }, select: { id: true, productId: true, method: true } });
      const status = parseBatchStatus(res.json);
      if (!status.done) continue;
      await applyResults(storeId, items, status.errors);
    }
    if (round < rounds - 1) await sleep(1500);
  }
}

async function applyResults(storeId: string, items: Array<{ id: string; productId: string; method: string | null }>, errors: Map<string, string>) {
  const now = new Date();
  const okDeletes = items.filter((item) => item.method === "DELETE" && !errors.has(item.productId)).map((item) => item.id);
  const okUpserts = items.filter((item) => item.method !== "DELETE" && !errors.has(item.productId)).map((item) => item.id);
  if (okDeletes.length) await db.whatsAppCatalogItem.updateMany({ where: { id: { in: okDeletes } }, data: { status: "deleted", remote: false, handle: null, error: null, syncedAt: now } });
  if (okUpserts.length) await db.whatsAppCatalogItem.updateMany({ where: { id: { in: okUpserts } }, data: { status: "synced", remote: true, handle: null, error: null, syncedAt: now } });
  for (const item of items) {
    const message = errors.get(item.productId);
    if (!message) continue;
    // CREATE of an item Meta already has (e.g. added by the feed): switch to UPDATE on the next sync.
    const duplicate = item.method === "CREATE" && /already exists|duplicate/i.test(message);
    await db.whatsAppCatalogItem.update({
      where: { id: item.id },
      data: duplicate ? { status: "pending", remote: true, handle: null, hash: null, error: null } : { status: "failed", handle: null, error: message.slice(0, 300) },
    });
  }
}

/**
 * Pushes the store's products to its catalog: CREATE/UPDATE for new or changed products, DELETE for ones that left
 * the store, in batches of 500, then checks Meta's answer for each batch. `manual` ("Sync now") also retries
 * products Meta rejected before and waits a little longer for Meta's answer.
 */
export async function syncCatalog(storeId: string, options: { manual?: boolean; full?: boolean } = {}): Promise<SyncSummary> {
  const empty = (status: SyncSummary["status"], message: string | null): SyncSummary => ({ status, sent: 0, unchanged: 0, failed: 0, pending: 0, message });
  const row = await getCatalogRow(storeId);
  if (!row?.catalogId) return empty("skipped", "Choose a catalog first.");
  if (!(await claim(storeId))) return empty("busy", "A sync is already running.");

  try {
    const creds = await whatsappCreds(storeId);
    if (!creds) {
      const summary = empty("error", "WhatsApp isn't connected any more. Reconnect it to keep your catalog in sync.");
      await finish(storeId, summary, false);
      return summary;
    }
    const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, customDomain: true, currency: true, status: true, brandSettings: true } });
    if (!store || !(await storeIsLive(store))) {
      const summary = empty("error", "Your store isn't live yet. Publish it first: WhatsApp product links open your store.");
      await finish(storeId, summary, false);
      return summary;
    }

    // 1. Earlier batches Meta hasn't answered yet.
    await pollPending(storeId, row.catalogId, creds.accessToken, 1);

    // 2. What changed.
    const build = await buildCatalogItems(store);
    const records = await db.whatsAppCatalogItem.findMany({ where: { storeId }, select: { productId: true, hash: true, status: true, remote: true, handle: true, method: true } });
    const plan = planSync(build.items, records, { full: options.full, retryFailed: options.manual });

    // Products the feed leaves out (no photo, no price) are listed with the reason; ones that are gone are forgotten.
    const listed = new Set(build.items.map((item) => item.id));
    const skippedIds = new Set(build.skipped.map((item) => item.id));
    for (const skipped of build.skipped) {
      const record = records.find((r) => r.productId === skipped.id);
      if (record?.remote) continue; // a DELETE is planned for it
      await db.whatsAppCatalogItem.upsert({
        where: { storeId_productId: { storeId, productId: skipped.id } },
        create: { storeId, productId: skipped.id, catalogId: row.catalogId, status: "skipped", error: `Not sent: ${skipped.reason.toLowerCase()}` },
        update: { status: "skipped", error: `Not sent: ${skipped.reason.toLowerCase()}`, handle: null },
      });
    }
    const gone = records.filter((r) => !listed.has(r.productId) && !skippedIds.has(r.productId) && !r.remote).map((r) => r.productId);
    if (gone.length) await db.whatsAppCatalogItem.deleteMany({ where: { storeId, productId: { in: gone } } });

    // 3. Send.
    let failedBatch: { message: string; kind: string } | null = null;
    for (const requests of chunk(plan.requests, BATCH_SIZE)) {
      const ids = requests.map((request) => request.data.id);
      // Queue them first, so a failed call leaves them pending (retried) rather than invisible.
      await db.whatsAppCatalogItem.createMany({ data: ids.map((productId) => ({ storeId, productId, catalogId: row.catalogId!, status: "pending" })), skipDuplicates: true });
      const res = await graph(`${encodeURIComponent(row.catalogId)}/items_batch`, creds.accessToken, { body: itemsBatchBody(requests), timeoutMs: 60_000 });
      if (!res.ok) {
        failedBatch = { message: res.error.message, kind: res.error.kind };
        await db.whatsAppCatalogItem.updateMany({ where: { storeId, productId: { in: ids } }, data: { status: "pending", handle: null, error: res.error.message } });
        await notePermissionProblem(storeId, res.error.kind);
        break;
      }
      const answer = parseBatchResponse(res.json);
      const handle = answer.handles[0] ?? null;
      await db.$transaction(
        requests.map((request) =>
          db.whatsAppCatalogItem.update({
            where: { storeId_productId: { storeId, productId: request.data.id } },
            data: answer.errors.has(request.data.id)
              ? { status: "failed", method: request.method, hash: plan.hashes.get(request.data.id) ?? null, handle: null, error: answer.errors.get(request.data.id)!, catalogId: row.catalogId! }
              : { status: "pending", method: request.method, hash: plan.hashes.get(request.data.id) ?? null, handle, error: null, catalogId: row.catalogId! },
          }),
        ),
      );
      // No handle means Meta accepted the batch synchronously.
      if (!handle) {
        const items = await db.whatsAppCatalogItem.findMany({ where: { storeId, productId: { in: ids.filter((id) => !answer.errors.has(id)) }, status: "pending", handle: null }, select: { id: true, productId: true, method: true } });
        await applyResults(storeId, items, new Map());
      }
    }

    // 4. Meta's answer for what was just sent.
    if (!failedBatch && plan.requests.length) await pollPending(storeId, row.catalogId, creds.accessToken, options.manual ? 5 : 2);

    const counts = await itemCounts(storeId);
    const status: SyncSummary["status"] = failedBatch ? "error" : counts.failed ? "partial" : "ok";
    const message = failedBatch?.message ?? (counts.failed ? `Meta rejected ${counts.failed} product${counts.failed === 1 ? "" : "s"}. See the list below.` : null);
    const summary: SyncSummary = { status, sent: plan.requests.length, unchanged: plan.unchanged, failed: counts.failed, pending: counts.pending, message };
    // Network trouble or rate limits: try again on the next cron run.
    await finish(storeId, summary, failedBatch?.kind === "rate_limit" || failedBatch?.kind === "other");
    return summary;
  } catch (error) {
    console.error("[whatsapp-catalog] sync failed", { storeId, error: error instanceof Error ? error.message : "unknown" });
    const summary = empty("error", "The sync stopped unexpectedly. It will try again shortly.");
    await finish(storeId, summary, true).catch(() => null);
    return summary;
  }
}

/** Page visit: push pending changes in the background if the store is dirty (callers run it inside `after`). */
export async function syncIfDirty(storeId: string) {
  const row = await getCatalogRow(storeId).catch(() => null);
  const inFlight = row?.catalogId ? await db.whatsAppCatalogItem.count({ where: { storeId, status: "pending", handle: { not: null } } }) : 0;
  if (!row?.catalogId || row.permissionState === "missing" || (!row.dirty && !inFlight)) return null;
  return syncCatalog(storeId);
}

/** Cron: dirty stores, stores with batches in flight, and a re-check of every catalog every 6 hours. */
export async function syncDueStores(limit = 25) {
  const stale = new Date(Date.now() - RECHECK_MS);
  const inFlight = await db.whatsAppCatalogItem.findMany({ where: { status: "pending", handle: { not: null } }, select: { storeId: true }, distinct: ["storeId"], take: limit });
  const rows = await db.whatsAppCatalog.findMany({
    where: {
      catalogId: { not: null },
      permissionState: { not: "missing" },
      OR: [{ dirty: true }, { lastSyncAt: null }, { lastSyncAt: { lt: stale } }, { storeId: { in: inFlight.map((r) => r.storeId) } }],
    },
    orderBy: [{ dirtyAt: "asc" }],
    select: { storeId: true },
    take: limit,
  });
  const results: Array<{ storeId: string; status: string; sent: number; failed: number }> = [];
  for (const { storeId } of rows) {
    const summary = await syncCatalog(storeId);
    results.push({ storeId, status: summary.status, sent: summary.sent, failed: summary.failed });
  }
  return { stores: rows.length, results };
}

// ─── The page's view ─────────────────────────────────────────────────────────

export async function itemCounts(storeId: string): Promise<ItemCounts> {
  const grouped = await db.whatsAppCatalogItem.groupBy({ by: ["status"], where: { storeId }, _count: { _all: true } });
  return countItems(grouped.map((group) => ({ status: group.status, count: group._count._all })));
}

export interface CatalogView {
  whatsapp: { connected: boolean; displayName: string | null; hasWabaId: boolean };
  storeLive: boolean;
  feed: { url: string; rotatedAt: string | null; fetchedAt: string | null; listed: number; skipped: number };
  permissions: { state: string; missing: string[]; checkedAt: string | null };
  catalog: {
    id: string | null;
    name: string | null;
    businessId: string | null;
    linkedToWhatsApp: boolean;
    cartEnabled: boolean;
    catalogVisible: boolean;
    lastSyncAt: string | null;
    lastSyncStatus: string | null;
    lastSyncError: string | null;
    syncing: boolean;
    dirty: boolean;
  };
  counts: ItemCounts;
  problems: Array<{ productId: string; name: string; status: string; error: string | null }>;
}

const iso = (value: Date | null | undefined) => value?.toISOString() ?? null;

export async function catalogView(storeId: string): Promise<CatalogView | null> {
  const store = await db.store.findUnique({ where: { id: storeId }, select: { id: true, name: true, slug: true, customDomain: true, currency: true, status: true, brandSettings: true } });
  if (!store) return null;
  const [row, channel, live, build, counts, problemRows] = await Promise.all([
    ensureCatalogRow(storeId),
    db.inboxChannel.findUnique({ where: { storeId_channel: { storeId, channel: "whatsapp" } }, select: { status: true, displayName: true, settings: true } }),
    storeIsLive(store),
    buildCatalogItems(store),
    itemCounts(storeId),
    db.whatsAppCatalogItem.findMany({ where: { storeId, status: { in: ["failed", "skipped"] } }, orderBy: [{ status: "asc" }, { updatedAt: "desc" }], take: 100, select: { productId: true, status: true, error: true } }),
  ]);
  const names = new Map(
    (await db.storeProduct.findMany({ where: { storeId, id: { in: problemRows.map((r) => r.productId) } }, select: { id: true, name: true } })).map((p) => [p.id, p.name]),
  );
  const connected = channel?.status === "connected";
  const settings = (channel?.settings ?? {}) as Record<string, unknown>;
  return {
    whatsapp: { connected, displayName: connected ? (channel?.displayName ?? null) : null, hasWabaId: Boolean(row.wabaId || settings.wabaId) },
    storeLive: live,
    feed: { url: catalogFeedUrl(store.slug, row.feedToken), rotatedAt: iso(row.feedTokenRotatedAt), fetchedAt: iso(row.feedFetchedAt), listed: build.items.length, skipped: build.skipped.length },
    permissions: { state: row.permissionState, missing: row.missingPermissions, checkedAt: iso(row.permissionsCheckedAt) },
    catalog: {
      id: row.catalogId,
      name: row.catalogName,
      businessId: row.businessId,
      linkedToWhatsApp: Boolean(row.wabaLinkedAt),
      cartEnabled: row.cartEnabled,
      catalogVisible: row.catalogVisible,
      lastSyncAt: iso(row.lastSyncAt),
      lastSyncStatus: row.lastSyncStatus,
      lastSyncError: row.lastSyncError,
      syncing: Boolean(row.syncStartedAt && row.syncStartedAt.getTime() > Date.now() - LOCK_MS),
      dirty: row.dirty,
    },
    counts,
    problems: problemRows.map((r) => ({ productId: r.productId, name: names.get(r.productId) ?? "Removed product", status: r.status, error: r.error })),
  };
}

// ─── Product messages ────────────────────────────────────────────────────────

/**
 * Sends one product (`product`) or several (`product_list`) from the store's synced catalog to a customer on
 * WhatsApp. Retailer ids are store product ids. Free-form, so only within 24 hours of the customer's last message.
 * For Peggy and campaigns to use; nothing calls it yet.
 */
export async function sendProductMessage(
  storeId: string,
  to: string,
  productRetailerIds: string[],
  options: ProductMessageOptions = {},
): Promise<{ ok: true; externalId: string | null } | { ok: false; error: string }> {
  const [creds, row] = await Promise.all([whatsappCreds(storeId), getCatalogRow(storeId)]);
  if (!creds) return { ok: false, error: "WhatsApp isn't connected." };
  if (!row?.catalogId || !row.wabaLinkedAt) return { ok: false, error: "Sync your products to a WhatsApp catalog first (Inbox → WhatsApp catalog)." };
  let payload;
  try {
    payload = productMessagePayload(to, row.catalogId, productRetailerIds, options);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Choose at least one product." };
  }
  const res = await graph(`${encodeURIComponent(creds.phoneNumberId)}/messages`, creds.accessToken, { body: payload, timeoutMs: 15_000 });
  if (!res.ok) return { ok: false, error: whatsappError(res.json, res.error.message) };
  const id = (res.json.messages as Array<{ id?: string }> | undefined)?.[0]?.id ?? null;
  return { ok: true, externalId: id };
}
