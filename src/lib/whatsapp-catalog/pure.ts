// WhatsApp catalog: pure helpers shared by the public feed route, the Graph API sync and the tests
// (tests/whatsapp-catalog.test.mjs). No database, no network, no "server-only".
//
// Two ways a store's products reach WhatsApp:
// 1. The feed: a token-protected CSV in Meta's catalog format that the seller pastes into Commerce Manager as a
//    scheduled data feed. Needs no extra permissions.
// 2. Direct sync: items_batch requests to a catalog the store's WhatsApp token can manage (catalog_management +
//    business_management), linked to the WhatsApp Business Account with the cart switched on.

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { toCsv } from "../csv.ts";
import type { FeedBuild, FeedItem } from "../social/feeds.ts";

// ─── Feed token ──────────────────────────────────────────────────────────────

/** 32 random bytes, URL-safe: unguessable, and it can be rotated. */
export function generateFeedToken() {
  return randomBytes(32).toString("base64url");
}

const TOKEN_SHAPE = /^[A-Za-z0-9_-]{32,128}$/;

/** Constant-time check of the token in the feed URL against the store's; a missing or odd-shaped token fails. */
export function feedTokenMatches(given: string | null | undefined, expected: string | null | undefined) {
  if (!given || !expected || !TOKEN_SHAPE.test(given) || !TOKEN_SHAPE.test(expected)) return false;
  // Hash both sides so the comparison has the same length whatever was sent.
  const a = createHash("sha256").update(given).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

/** The path of a store's feed; the origin is added by the caller. */
export function catalogFeedPath(slug: string, token: string) {
  return `/api/public/store/${encodeURIComponent(slug)}/catalog-feed.csv?token=${encodeURIComponent(token)}`;
}

/** The same URL with the token hidden, for screens and logs. */
export function maskFeedUrl(url: string) {
  return url.replace(/([?&]token=)([^&]{4})[^&]*/, "$1$2…");
}

// ─── Feed rows (Meta catalog CSV) ────────────────────────────────────────────

/** Meta's column names. https://www.facebook.com/business/help/120325381656392 */
export const CATALOG_FEED_COLUMNS = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "sale_price",
  "link",
  "image_link",
  "additional_image_link",
  "brand",
  "gtin",
  "mpn",
  "product_type",
] as const;

export type CatalogRow = Record<(typeof CATALOG_FEED_COLUMNS)[number], string>;

/** One feed item as Meta's fields (the CSV row and the items_batch data share these). */
export function catalogRow(item: FeedItem): CatalogRow {
  return {
    id: item.id,
    title: item.title,
    description: item.description,
    availability: item.inStock ? "in stock" : "out of stock",
    condition: "new",
    price: item.price,
    sale_price: item.salePrice ?? "",
    link: item.link,
    image_link: item.imageLink,
    // Meta reads several extra images from one cell, comma-separated (the CSV writer quotes the cell).
    additional_image_link: item.additionalImageLinks.join(","),
    brand: item.brand,
    gtin: item.gtin ?? "",
    mpn: item.mpn ?? "",
    product_type: item.productType ?? "",
  };
}

export function catalogFeedCsv(build: Pick<FeedBuild, "items">) {
  // Cells are written as-is (quoted when they hold commas, quotes or newlines): Meta reads the raw text, so no
  // spreadsheet-style formula escaping, which would show up in titles.
  const rows = build.items.map((item) => {
    const row = catalogRow(item);
    return CATALOG_FEED_COLUMNS.map((column) => row[column]);
  });
  return toCsv([[...CATALOG_FEED_COLUMNS], ...rows]);
}

// ─── items_batch ─────────────────────────────────────────────────────────────

export type BatchMethod = "CREATE" | "UPDATE" | "DELETE";

export interface BatchRequest {
  method: BatchMethod;
  data: Record<string, string>;
}

/** The items_batch `data` for a product (empty optional fields are left out; Meta rejects some blanks). */
export function batchData(item: FeedItem): Record<string, string> {
  const row = catalogRow(item);
  const data: Record<string, string> = {};
  for (const column of CATALOG_FEED_COLUMNS) if (row[column]) data[column] = row[column];
  return data;
}

/** A stable fingerprint of what would be sent, so an unchanged product isn't sent again. */
export function itemHash(data: Record<string, string>) {
  const keys = Object.keys(data).sort();
  return createHash("sha1").update(JSON.stringify(keys.map((key) => [key, data[key]]))).digest("hex");
}

export interface ItemRecord {
  productId: string;
  hash: string | null;
  status: string;
  remote: boolean;
  /** items_batch handle still being checked (the item is in flight). */
  handle?: string | null;
  method?: string | null;
}

export interface SyncPlan {
  requests: BatchRequest[];
  /** productId → hash of the data in this plan (DELETEs have none). */
  hashes: Map<string, string | null>;
  unchanged: number;
}

/**
 * What to send: CREATE for products Meta hasn't got, UPDATE for changed ones (and failed ones when `retryFailed`),
 * DELETE for products that left the feed (unpublished, archived, deleted, no photo or price) but Meta still has.
 * `full` resends everything (the "Sync now" button after the catalog changed).
 */
export function planSync(items: FeedItem[], records: ItemRecord[], options: { full?: boolean; retryFailed?: boolean } = {}): SyncPlan {
  const byId = new Map(records.map((record) => [record.productId, record]));
  const requests: BatchRequest[] = [];
  const hashes = new Map<string, string | null>();
  const listed = new Set<string>();
  let unchanged = 0;
  for (const item of items) {
    listed.add(item.id);
    const data = batchData(item);
    const hash = itemHash(data);
    const record = byId.get(item.id);
    if (record && !options.full) {
      const same = record.hash === hash;
      // In flight with this exact data: wait for Meta's answer rather than sending it twice.
      if (same && record.status === "pending" && record.handle) {
        unchanged++;
        continue;
      }
      if (same && record.remote && record.status === "synced") {
        unchanged++;
        continue;
      }
      // Meta refused this exact data before: only retry when asked ("Sync now"), not on every background sync.
      if (same && record.status === "failed" && !options.retryFailed) {
        unchanged++;
        continue;
      }
    }
    requests.push({ method: record?.remote ? "UPDATE" : "CREATE", data });
    hashes.set(item.id, hash);
  }
  for (const record of records) {
    if (listed.has(record.productId) || !record.remote) continue;
    if (record.method === "DELETE" && record.status === "pending" && record.handle && !options.full) continue;
    requests.push({ method: "DELETE", data: { id: record.productId } });
    hashes.set(record.productId, null);
  }
  return { requests, hashes, unchanged };
}

/** Meta takes up to 5000 requests per items_batch call; smaller batches finish (and report errors) sooner. */
export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < list.length; index += size) out.push(list.slice(index, index + size));
  return out;
}

export function itemsBatchBody(requests: BatchRequest[]) {
  return { item_type: "PRODUCT_ITEM", allow_upsert: true, requests };
}

// ─── Graph errors and batch status ───────────────────────────────────────────

export type GraphErrorKind = "permission" | "token" | "rate_limit" | "not_found" | "duplicate" | "other";

export interface GraphError {
  kind: GraphErrorKind;
  code: number | null;
  subcode: number | null;
  message: string;
}

export const REQUIRED_PERMISSIONS = ["catalog_management", "business_management"] as const;

/** Meta's error body → what kind of problem it is and a message the seller can act on. */
export function parseGraphError(json: unknown, status = 400): GraphError {
  const error = (json && typeof json === "object" ? (json as Record<string, unknown>).error : null) as Record<string, unknown> | null;
  const code = error && Number.isFinite(Number(error.code)) ? Number(error.code) : null;
  const subcode = error && Number.isFinite(Number(error.error_subcode)) ? Number(error.error_subcode) : null;
  const raw = String((error?.error_user_msg as string) || (error?.message as string) || `Meta answered ${status}`).slice(0, 300);
  const text = raw.toLowerCase();
  let kind: GraphErrorKind = "other";
  if (code === 190 || code === 102 || code === 463 || code === 467) kind = "token";
  else if (code === 10 || (code !== null && code >= 200 && code <= 299) || /permission|not authorized|does not have the capability|missing.*scope/.test(text)) kind = "permission";
  else if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80004 || code === 80009 || code === 80014 || code === 130429 || status === 429) kind = "rate_limit";
  else if (code === 100 && (subcode === 33 || /does not exist|unsupported get request|cannot be loaded/.test(text))) kind = "not_found";
  else if (/already exists|duplicate/.test(text)) kind = "duplicate";
  return { kind, code, subcode, message: friendlyGraphMessage(kind, raw) };
}

function friendlyGraphMessage(kind: GraphErrorKind, raw: string) {
  switch (kind) {
    case "token":
      return "Your WhatsApp token stopped working (expired or revoked). Reconnect WhatsApp in Inbox → Peggy chatbot → WhatsApp.";
    case "permission":
      return `Your WhatsApp token can't manage catalogs (it needs ${REQUIRED_PERMISSIONS.join(" and ")}). Use the feed URL instead, or reconnect with those permissions. Meta said: ${raw}`;
    case "rate_limit":
      return "Meta is limiting requests right now. The sync will try again shortly.";
    case "not_found":
      return `Meta couldn't find that catalog or account (it may have been deleted, or the token can't see it). Meta said: ${raw}`;
    default:
      return raw;
  }
}

/** From debug_token's data: which of the required permissions the token lacks (null when Meta didn't say). */
export function missingPermissions(data: unknown): string[] | null {
  if (!data || typeof data !== "object") return null;
  const record = data as { scopes?: unknown; granular_scopes?: unknown; is_valid?: unknown };
  const scopes = new Set<string>();
  if (Array.isArray(record.scopes)) for (const scope of record.scopes) if (typeof scope === "string") scopes.add(scope);
  if (Array.isArray(record.granular_scopes)) for (const entry of record.granular_scopes) if (entry && typeof (entry as { scope?: unknown }).scope === "string") scopes.add((entry as { scope: string }).scope);
  if (!scopes.size) return null;
  return REQUIRED_PERMISSIONS.filter((scope) => !scopes.has(scope));
}

/** From debug_token's granular scopes: the ids a permission was granted for (business, WABA). */
export function grantedTargets(data: unknown, scope: string): string[] {
  const list = data && typeof data === "object" ? (data as { granular_scopes?: unknown }).granular_scopes : null;
  if (!Array.isArray(list)) return [];
  const entry = list.find((item) => item && (item as { scope?: unknown }).scope === scope) as { target_ids?: unknown } | undefined;
  return Array.isArray(entry?.target_ids) ? entry.target_ids.filter((id): id is string => typeof id === "string" && /^\d+$/.test(id)) : [];
}

export interface BatchStatus {
  /** finished | in_progress | started | error | unknown */
  state: string;
  done: boolean;
  /** retailer id → Meta's message for that item */
  errors: Map<string, string>;
  /** Errors Meta couldn't tie to an item. */
  general: string[];
}

/**
 * GET /{catalog_id}/check_batch_request_status?handle=… →
 * { data: [{ handle, status: "finished" | "in_progress" | "started", errors_total_count, errors: [{ line, id, message }], warnings }] }
 */
export function parseBatchStatus(json: unknown, requestIds: string[] = []): BatchStatus {
  const data = json && typeof json === "object" ? (json as { data?: unknown }).data : null;
  const entry = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null | undefined;
  const state = typeof entry?.status === "string" ? entry.status.toLowerCase() : "unknown";
  const errors = new Map<string, string>();
  const general: string[] = [];
  const list = Array.isArray(entry?.errors) ? (entry!.errors as Array<Record<string, unknown>>) : [];
  for (const error of list) {
    const message = String(error.message ?? error.error_message ?? "Meta rejected this product.").slice(0, 300);
    const id = typeof error.id === "string" ? error.id : typeof error.retailer_id === "string" ? error.retailer_id : null;
    const line = typeof error.line === "number" ? error.line : null;
    const retailerId = id ?? (line !== null ? requestIds[line] : undefined);
    if (retailerId) errors.set(retailerId, errors.has(retailerId) ? `${errors.get(retailerId)} ${message}` : message);
    else general.push(message);
  }
  return { state, done: state === "finished" || state === "error", errors, general };
}

/** items_batch's immediate answer: { handles: [...], validation_status: [{ retailer_id, errors: [{ message }] }] }. */
export function parseBatchResponse(json: unknown): { handles: string[]; errors: Map<string, string> } {
  const record = (json && typeof json === "object" ? json : {}) as Record<string, unknown>;
  const handles = Array.isArray(record.handles) ? record.handles.filter((h): h is string => typeof h === "string") : [];
  const errors = new Map<string, string>();
  if (Array.isArray(record.validation_status)) {
    for (const entry of record.validation_status as Array<Record<string, unknown>>) {
      const id = typeof entry.retailer_id === "string" ? entry.retailer_id : null;
      const list = Array.isArray(entry.errors) ? (entry.errors as Array<Record<string, unknown>>) : [];
      if (id && list.length) errors.set(id, list.map((e) => String(e.message ?? "Invalid product")).join(" ").slice(0, 300));
    }
  }
  return { handles, errors };
}

// ─── Product messages ────────────────────────────────────────────────────────

export interface ProductMessageOptions {
  body?: string;
  header?: string;
  footer?: string;
  sectionTitle?: string;
}

/**
 * The /messages payload for one product (`type: "product"`) or several (`type: "product_list"`, up to 30 items,
 * which WhatsApp shows as a scrollable list with the cart). Throws on an empty or oversized list.
 */
export function productMessagePayload(to: string, catalogId: string, retailerIds: string[], options: ProductMessageOptions = {}) {
  const ids = [...new Set(retailerIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new Error("Choose at least one product.");
  if (ids.length > 30) throw new Error("WhatsApp shows at most 30 products in one message.");
  const recipient = to.replace(/[^\d]/g, "");
  const footer = options.footer ? { footer: { text: options.footer.slice(0, 60) } } : {};
  if (ids.length === 1) {
    return {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: recipient,
      type: "interactive",
      interactive: {
        type: "product",
        ...(options.body ? { body: { text: options.body.slice(0, 1024) } } : {}),
        ...footer,
        action: { catalog_id: catalogId, product_retailer_id: ids[0] },
      },
    };
  }
  return {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to: recipient,
    type: "interactive",
    interactive: {
      type: "product_list",
      header: { type: "text", text: (options.header || "Our products").slice(0, 60) },
      body: { text: (options.body || "Tap a product to see it and add it to your cart.").slice(0, 1024) },
      ...footer,
      action: {
        catalog_id: catalogId,
        sections: [{ title: (options.sectionTitle || "Products").slice(0, 24), product_items: ids.map((id) => ({ product_retailer_id: id })) }],
      },
    },
  };
}

// ─── Status for the page ─────────────────────────────────────────────────────

export interface ItemCounts {
  synced: number;
  failed: number;
  pending: number;
  skipped: number;
}

export function countItems(statuses: Array<{ status: string; count: number }>): ItemCounts {
  const counts: ItemCounts = { synced: 0, failed: 0, pending: 0, skipped: 0 };
  for (const { status, count } of statuses) if (status in counts) counts[status as keyof ItemCounts] += count;
  return counts;
}
