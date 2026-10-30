// Resell (pilot feature "resell", shared/feature-switches.ts): a shop switches "Let resellers sell this" on for a
// product with a commission (1–50%). A reseller (any signed-in Shopinbos user the feature is on for; later the
// earners in Plug's Earn mode) gets their own short link for it: app.shopinbos.com/rs/<code>. The link sends the
// buyer to the product on the shop with ?rs=<code>; the storefront remembers the code for 7 days and checkout sends
// it with the order. Once the order is paid, the sale counts and the commission is owed BY THE SHOP to the reseller.
//
// Shopinbos never holds or moves this money: it only records what is owed (ResellSale), so the shop knows who to pay.
// Payouts are marked in an admin ledger later (status "paid"). Pure, unit-tested (tests/resell.test.mjs).
//
// A sale's life (ResellSale.status):
//   awaiting_payment → the order was placed through a reseller link and isn't paid yet (not counted anywhere)
//   pending          → the order is paid: commission owed once it's delivered
//   approved         → the order was delivered: commission owed now
//   paid             → the shop paid the reseller (set by the payout ledger)
//   void             → the order was cancelled, refunded or returned before the commission was paid

export const RESELL_FEATURE = "resell";

export const RESELL_PCT_MIN = 1;
export const RESELL_PCT_MAX = 50;
export const RESELL_PCT_DEFAULT = 10;

/** How long a reseller's link counts after the buyer opens it (last link opened for a product wins). */
export const RESELL_WINDOW_DAYS = 7;
export const RESELL_WINDOW_MS = RESELL_WINDOW_DAYS * 24 * 60 * 60 * 1000;

/** The storefront query parameter carrying the code (the /rs/<code> redirect adds it). */
export const RESELL_PARAM = "rs";
/** The short link's path on the app: /rs/<code> (/r/ is Refer & earn). */
export const RESELL_LINK_PATH = "/rs";

/** New links one reseller may make in a day (a link per product, so this is products per day). */
export const RESELL_LINKS_PER_DAY = 30;
/** How many link codes a browser remembers per shop (newest first). */
export const RESELL_CODES_KEPT = 10;

export const RESELL_SALE_STATUSES = ["awaiting_payment", "pending", "approved", "paid", "void"] as const;
export type ResellSaleStatus = (typeof RESELL_SALE_STATUSES)[number];

/** Order statuses that end a sale's commission (unless the shop already paid it). */
export const RESELL_CLOSED_ORDER_STATUSES = ["cancelled", "refunded", "returned"] as const;

const CODE_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz"; // no 0/o, 1/l/i: easy to read out loud
export const RESELL_CODE_LENGTH = 8;

// ─── Settings ─────────────────────────────────────────────────────────────────

/** A commission percent the shop typed: 1–50, at most two decimals. Null when it can't be one. */
export function cleanResellPct(value: unknown): number | null {
  const number = typeof value === "string" ? Number(value.replace(/%/g, "").trim()) : Number(value);
  if (value === null || value === undefined || value === "" || !Number.isFinite(number)) return null;
  const rounded = Math.round(number * 100) / 100;
  return rounded >= RESELL_PCT_MIN && rounded <= RESELL_PCT_MAX ? rounded : null;
}

// ─── Codes and links ──────────────────────────────────────────────────────────

/** A short link code from random bytes (crypto.randomBytes / getRandomValues on the caller's side). */
export function resellCodeFrom(bytes: ArrayLike<number>, length = RESELL_CODE_LENGTH): string {
  let code = "";
  for (let index = 0; index < length; index++) code += CODE_ALPHABET[(bytes[index % bytes.length] ?? 0) % CODE_ALPHABET.length];
  return code;
}

/** Normalises a code from a URL or a browser: lower case letters and digits, 6–16 long. Null otherwise. */
export function cleanResellCode(value: unknown): string | null {
  const code = typeof value === "string" ? value.trim().toLowerCase() : "";
  return /^[a-z0-9]{6,16}$/.test(code) ? code : null;
}

/** The reseller's short link: <app origin>/rs/<code>. */
export function resellLinkUrl(appOrigin: string, code: string): string {
  return `${appOrigin.replace(/\/+$/, "")}${RESELL_LINK_PATH}/${code}`;
}

/** An absolute storefront URL with ?rs=<code> set (any other query or #hash it has is kept). */
export function withResellParam(url: string, code: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set(RESELL_PARAM, code);
  return parsed.toString();
}

// ─── Attribution (the browser remembers; checkout sends) ──────────────────────

export interface RememberedCode {
  code: string;
  at: number;
}

/** Reads what a browser saved (anything unreadable → nothing). */
export function readRememberedCodes(raw: unknown): RememberedCode[] {
  if (!Array.isArray(raw)) return [];
  const out: RememberedCode[] = [];
  for (const entry of raw) {
    const code = cleanResellCode((entry as { code?: unknown })?.code);
    const at = Number((entry as { at?: unknown })?.at);
    if (code && Number.isFinite(at) && at > 0) out.push({ code, at });
  }
  return out;
}

/** True while a link opened at `at` still counts at `now`. */
export function resellWindowOpen(at: number, now: number): boolean {
  return now >= at - 60_000 && now - at < RESELL_WINDOW_MS;
}

/** Adds a code the buyer just opened: newest first, once each, only codes still in their window, at most 10. */
export function rememberResellCode(list: readonly RememberedCode[], code: string, now: number): RememberedCode[] {
  const clean = cleanResellCode(code);
  const kept = list.filter((entry) => entry.code !== clean && resellWindowOpen(entry.at, now));
  return (clean ? [{ code: clean, at: now }, ...kept] : kept).sort((a, b) => b.at - a.at).slice(0, RESELL_CODES_KEPT);
}

/** The codes checkout sends: still in their window, newest first. */
export function liveResellCodes(list: readonly RememberedCode[], now: number): string[] {
  return [...list].filter((entry) => resellWindowOpen(entry.at, now)).sort((a, b) => b.at - a.at).map((entry) => entry.code).slice(0, RESELL_CODES_KEPT);
}

export interface ResellLinkRef {
  id: string;
  code: string;
  productId: string;
  resellerUserId: string;
}

/**
 * Which links an order is credited to: per product in the order, the newest code (codes come newest first) whose
 * link is for that product. One link per product; links for products not in the order count for nothing. The shop's
 * own links (`ownerUserId`) never count.
 */
export function pickResellLinks<L extends ResellLinkRef>(codesNewestFirst: readonly string[], links: readonly L[], orderProductIds: Iterable<string>, ownerUserId?: string | null): L[] {
  const inOrder = new Set(orderProductIds);
  const byCode = new Map(links.map((link) => [link.code, link]));
  const chosen = new Map<string, L>();
  for (const code of codesNewestFirst) {
    const link = byCode.get(code);
    if (!link || !inOrder.has(link.productId) || chosen.has(link.productId)) continue;
    if (ownerUserId && link.resellerUserId === ownerUserId) continue;
    chosen.set(link.productId, link);
  }
  return [...chosen.values()];
}

// ─── Commission maths ─────────────────────────────────────────────────────────

export interface ResellOrderLine {
  productId: string;
  price: number;
  quantity: number;
}

/**
 * What the buyer paid for one product's lines (every version of it in the order) after discounts, in whole naira.
 * The order's product discount (codes, automatic discounts, points; never delivery) is shared across the lines in
 * proportion to their value. Delivery fees never count.
 */
export function resellLineTotal(lines: readonly ResellOrderLine[], productId: string, productDiscount = 0): { quantity: number; lineTotal: number } {
  let gross = 0;
  let quantity = 0;
  let subtotal = 0;
  for (const line of lines) {
    const value = Math.max(0, Number(line.price) || 0) * Math.max(0, Math.floor(Number(line.quantity) || 0));
    subtotal += value;
    if (line.productId !== productId) continue;
    gross += value;
    quantity += Math.max(0, Math.floor(Number(line.quantity) || 0));
  }
  const discount = Math.min(subtotal, Math.max(0, Number(productDiscount) || 0));
  const share = subtotal > 0 ? (discount * gross) / subtotal : 0;
  return { quantity, lineTotal: Math.max(0, Math.round(gross - share)) };
}

/** The commission on a line total at a percent, rounded to whole naira (half up). */
export function resellCommission(lineTotal: number, pct: number): number {
  const base = Math.max(0, Number(lineTotal) || 0);
  const rate = Math.min(RESELL_PCT_MAX, Math.max(0, Number(pct) || 0));
  return Math.round((base * rate) / 100 + 1e-9);
}

/** The sale row for one product of an order (null when the order has none of it, or it came to nothing). */
export function resellSaleFor(lines: readonly ResellOrderLine[], productId: string, productDiscount: number, pct: number) {
  const { quantity, lineTotal } = resellLineTotal(lines, productId, productDiscount);
  if (quantity <= 0 || lineTotal <= 0) return null;
  return { quantity, lineTotal, commissionPct: pct, commissionAmount: resellCommission(lineTotal, pct) };
}

// ─── Status ───────────────────────────────────────────────────────────────────

export function isResellStatus(value: unknown): value is ResellSaleStatus {
  return typeof value === "string" && (RESELL_SALE_STATUSES as readonly string[]).includes(value);
}

/** The order was paid: an awaiting sale now counts. Every other status stays as it is. */
export function statusAfterPaid(status: string): string {
  return status === "awaiting_payment" ? "pending" : status;
}

/** The order was delivered: the commission is owed now. */
export function statusAfterDelivered(status: string): string {
  return status === "awaiting_payment" || status === "pending" ? "approved" : status;
}

/** Cancelled, refunded or returned: voided, unless the shop already paid it (then the ledger sorts it out). */
export function canVoidResellSale(status: string): boolean {
  return status === "awaiting_payment" || status === "pending" || status === "approved";
}

/**
 * The status to show, from the order as it is now (the row may not have caught up yet): a closed order's sale reads
 * as void, a delivered order's paid sale as approved.
 */
export function effectiveResellStatus(status: string, orderStatus: string | null | undefined): string {
  if (orderStatus && (RESELL_CLOSED_ORDER_STATUSES as readonly string[]).includes(orderStatus) && canVoidResellSale(status)) return "void";
  if (orderStatus === "delivered" && status === "pending") return "approved";
  return status;
}

export interface ResellSaleLike {
  status: string;
  lineTotal: number;
  commissionAmount: number;
}

/**
 * Totals for a list of sales (already through effectiveResellStatus): owed = pending + approved (what the shop
 * owes), of which ready = approved (delivered); paid = paid out; sales = counted sales and their value.
 */
export function resellTotals(sales: readonly ResellSaleLike[]) {
  let owed = 0;
  let ready = 0;
  let paid = 0;
  let count = 0;
  let value = 0;
  for (const sale of sales) {
    const commission = Math.max(0, Number(sale.commissionAmount) || 0);
    if (sale.status === "void" || sale.status === "awaiting_payment") continue;
    count += 1;
    value += Math.max(0, Number(sale.lineTotal) || 0);
    if (sale.status === "paid") paid += commission;
    else {
      owed += commission;
      if (sale.status === "approved") ready += commission;
    }
  }
  return { owed, ready, paid, count, value };
}

/** Sales a list shows: awaiting-payment rows are left out (the order may never be paid). */
export function visibleResellSale(status: string): boolean {
  return status !== "awaiting_payment";
}
