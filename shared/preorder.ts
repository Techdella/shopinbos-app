// Preorders: selling a product before the stock arrives. Pure (no imports): shared by the seller's product form,
// the supplier's product form, the storefront, the marketplace and checkout, and tests/preorder.test.mjs.
//
// Two places use it:
//   - A supplier takes preorders on a marketplace listing (SupplierProduct): shops order stock now and the supplier
//     ships from the date it gives. The shop pays the supplier as for any bulk order.
//   - A seller takes preorders on a store product (StoreProduct): shoppers order now, the seller ships from the date.
//
// Money: Shopinbos never holds it. A preorder is paid like any other order (each share straight to its owner's
// bank), so there is no escrow. What protects the buyer is what the seller promises in plain words (`note`: when it
// ships, what happens if it's late) and an optional cap on how many are taken. The seller runs their business.

export interface PreorderSettings {
  enabled?: boolean | null;
  /** When it ships (or the stock arrives). Null: "soon". */
  shipsAt?: Date | string | null;
  /** Most units taken as preorders; null: no cap. */
  limit?: number | null;
  /** Units already taken (orders that still hold them). */
  taken?: number | null;
  /** The seller's / supplier's own promise to buyers, shown beside the button. */
  note?: string | null;
}

/** Longest note: a couple of sentences on a product page. */
export const PREORDER_NOTE_MAX = 280;
/** The highest cap anyone can set. */
export const PREORDER_LIMIT_MAX = 100_000;

export interface PreorderState {
  /** Preorders are switched on. */
  on: boolean;
  /** Buyers can preorder now (on, and the cap isn't reached). */
  open: boolean;
  /** Units still open under the cap; null: no cap. */
  left: number | null;
  /** The ship date as YYYY-MM-DD, or null. */
  shipsOn: string | null;
  note: string | null;
}

function whole(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

/** YYYY-MM-DD of a date (UTC), or null for anything that isn't one. */
export function preorderDay(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

export function preorderState(settings: PreorderSettings | null | undefined): PreorderState {
  const on = Boolean(settings?.enabled);
  const limit = typeof settings?.limit === "number" && Number.isFinite(settings.limit) && settings.limit > 0 ? Math.trunc(settings.limit) : null;
  const left = limit === null ? null : Math.max(0, limit - whole(settings?.taken));
  const note = settings?.note?.trim() ? settings.note.trim().slice(0, PREORDER_NOTE_MAX) : null;
  return { on, open: on && (left === null || left > 0), left, shipsOn: on ? preorderDay(settings?.shipsAt) : null, note: on ? note : null };
}

/** "12 Dec" (or "12 Dec 2027" when it isn't this year): the ship date in words. */
export function shipDateLabel(shipsOn: string, now: Date = new Date(), locale = "en-NG"): string {
  const date = new Date(`${shipsOn}T12:00:00Z`);
  const sameYear = date.getUTCFullYear() === now.getUTCFullYear();
  return date.toLocaleDateString(locale, { day: "numeric", month: "short", ...(sameYear ? {} : { year: "numeric" }), timeZone: "UTC" });
}

/** The line under a preorder button: "Ships from 12 Dec · 8 left", "Ships soon", "Preorders are full". */
export function preorderLine(state: PreorderState, now: Date = new Date()): string | null {
  if (!state.on) return null;
  if (!state.open) return "Preorders are full";
  const day = state.shipsOn && state.shipsOn >= now.toISOString().slice(0, 10) ? `Ships from ${shipDateLabel(state.shipsOn, now)}` : "Ships soon";
  return state.left !== null && state.left <= 20 ? `${day} · ${state.left} left` : day;
}

/** The most one bag line may hold: what's left under the cap, else no limit. */
export function preorderMaxQuantity(state: PreorderState): number | null {
  return state.open ? state.left : 0;
}

export type PreorderInput = { enabled?: unknown; shipsAt?: unknown; limit?: unknown; note?: unknown };

export type ParsedPreorder =
  | { ok: true; value: { preorderEnabled: boolean; preorderShipsAt: Date | null; preorderLimit: number | null; preorderNote: string | null } }
  | { ok: false; message: string };

/**
 * The preorder fields to save from a form or API body. A ship date must be a real date (YYYY-MM-DD or ISO); a cap
 * a whole number from 1; the note is trimmed and capped. Switching preorders off keeps the other values for next time.
 * `savedShipsAt`: the date already saved, which may have passed.
 */
export function parsePreorderInput(input: PreorderInput, now: Date = new Date(), savedShipsAt?: Date | string | null): ParsedPreorder {
  const enabled = input.enabled === true || input.enabled === "true" || input.enabled === "on";
  let shipsAt: Date | null = null;
  if (input.shipsAt !== undefined && input.shipsAt !== null && input.shipsAt !== "") {
    if (typeof input.shipsAt !== "string" && !(input.shipsAt instanceof Date)) return { ok: false, message: "Choose a valid ship date." };
    const raw = input.shipsAt instanceof Date ? input.shipsAt : new Date(/^\d{4}-\d{2}-\d{2}$/.test(input.shipsAt) ? `${input.shipsAt}T12:00:00Z` : input.shipsAt);
    if (Number.isNaN(raw.getTime())) return { ok: false, message: "Choose a valid ship date." };
    // A date already saved may have passed (an edit that doesn't touch it still saves); a new one can't be past.
    if (enabled && preorderDay(raw) !== preorderDay(savedShipsAt) && preorderDay(raw)! < now.toISOString().slice(0, 10)) return { ok: false, message: "The ship date has passed. Choose a date from today." };
    shipsAt = raw;
  }
  let limit: number | null = null;
  if (input.limit !== undefined && input.limit !== null && input.limit !== "") {
    const value = Number(input.limit);
    if (!Number.isInteger(value) || value < 1 || value > PREORDER_LIMIT_MAX) return { ok: false, message: "The preorder limit must be a whole number from 1." };
    limit = value;
  }
  const note = typeof input.note === "string" && input.note.trim() ? input.note.trim().slice(0, PREORDER_NOTE_MAX) : null;
  return { ok: true, value: { preorderEnabled: enabled, preorderShipsAt: shipsAt, preorderLimit: limit, preorderNote: note } };
}

/** What a preorder line says on an order: { preorder: true, shipsOn } (saved on the order's item, shown to the seller). */
export function preorderItemTag(state: PreorderState): { preorder: true; shipsOn: string | null } | null {
  return state.on ? { preorder: true, shipsOn: state.shipsOn } : null;
}

/** Whether an order's saved items include a preorder line. */
export function orderHasPreorder(items: unknown): boolean {
  return Array.isArray(items) && items.some((item) => Boolean(item && typeof item === "object" && (item as Record<string, unknown>).preorder === true));
}

/** The earliest ship date among an order's preorder lines (YYYY-MM-DD), or null. */
export function orderPreorderShipsOn(items: unknown): string | null {
  if (!Array.isArray(items)) return null;
  const days = items.flatMap((item) => {
    const row = item && typeof item === "object" ? (item as Record<string, unknown>) : null;
    return row?.preorder === true && typeof row.shipsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(row.shipsOn) ? [row.shipsOn] : [];
  });
  return days.sort()[0] ?? null;
}

/** A ready-to-post message for sharing a preorder on WhatsApp, Instagram, X or Facebook. */
export function preorderShareText(input: { name: string; price?: string | null; shipsOn: string | null; url: string; now?: Date }): string {
  const when = input.shipsOn ? ` Ships from ${shipDateLabel(input.shipsOn, input.now ?? new Date())}.` : "";
  const price = input.price ? ` ${input.price}.` : "";
  return `Preorder now: ${input.name}.${price}${when} Reserve yours before they're gone 👉 ${input.url}`;
}

/**
 * The columns to save for a product's preorder settings. Dropship products can't take preorders (they sell the
 * supplier's stock), so they are saved switched off. Switching preorders back on starts a fresh count.
 */
export function preorderSaveData(value: Extract<ParsedPreorder, { ok: true }>["value"], options: { dropship?: boolean; wasEnabled?: boolean } = {}) {
  const enabled = value.preorderEnabled && !options.dropship;
  return { ...value, preorderEnabled: enabled, ...(enabled && !options.wasEnabled ? { preorderTaken: 0 } : {}) };
}

// ─── Deposits (supplier preorders) ─────────────────────────────────────────────
//
// A supplier can ask shops to pay part of a preorder when they place it (SupplierProduct.preorderDepositPct). The
// rest (the balance) is due once the supplier says the stock is ready, and the order is only packed and sent once
// it's all paid. 0 % is the old way: the whole order is paid once the supplier accepts it. Money is in kobo.
// Store preorders (shoppers) have no deposit: checkout takes one payment per order.

/** What the supplier's form suggests first. */
export const PREORDER_DEPOSIT_SUGGESTED = 30;
/** The quick choices in the forms. */
export const PREORDER_DEPOSIT_CHOICES = [0, 30, 50, 100] as const;

/** Naira (as saved on orders) to kobo, rounded to the nearest kobo. */
export function toKobo(naira: number): number {
  return Number.isFinite(naira) ? Math.max(0, Math.round(naira * 100)) : 0;
}

/** A deposit percent from a form or API body: a whole number from 0 to 100. Empty means 0 (no deposit). */
export function parseDepositPct(value: unknown): { ok: true; value: number } | { ok: false; message: string } {
  if (value === undefined || value === null || value === "") return { ok: true, value: 0 };
  const number = typeof value === "number" ? value : typeof value === "string" ? Number(value.trim().replace(/%$/, "")) : NaN;
  if (!Number.isInteger(number) || number < 0 || number > 100) return { ok: false, message: "The deposit must be a whole percent from 0 to 100." };
  return { ok: true, value: number };
}

/**
 * Deposit and balance of an order total (kobo) at `pct` percent. The deposit is rounded up to whole naira (never
 * above the total), so the balance is what's left to the kobo: deposit + balance is always the total.
 */
export function depositSplit(totalKobo: number, pct: number): { depositKobo: number; balanceKobo: number } {
  const total = Math.max(0, Math.round(Number.isFinite(totalKobo) ? totalKobo : 0));
  const share = Math.min(100, Math.max(0, Math.trunc(Number.isFinite(pct) ? pct : 0)));
  if (share === 0 || total === 0) return { depositKobo: 0, balanceKobo: total };
  if (share === 100) return { depositKobo: total, balanceKobo: 0 };
  const deposit = Math.min(total, Math.ceil((total * share) / 100 / 100) * 100);
  return { depositKobo: deposit, balanceKobo: total - deposit };
}

/** The wholesale order fields the payment steps read. */
export interface WholesalePayFacts {
  status: string;
  totalPrice: number;
  currency?: string | null;
  preorder?: boolean | null;
  depositKobo?: number | null;
  depositPaidAt?: Date | string | null;
  preorderReadyAt?: Date | string | null;
  /** The whole order was paid by card in Shopinbos. */
  paidAt?: Date | string | null;
  /** The supplier confirmed they were paid (another way). */
  paidOutAt?: Date | string | null;
}

export type WholesalePayStep = "deposit" | "balance" | "full";

const UNSENT_WHOLESALE = ["pending", "confirmed", "processing"];
const ACCEPTED_WHOLESALE = ["confirmed", "processing", "shipped", "delivered"];

/** Whether the order asks for a deposit (a preorder whose supplier set one). */
export function hasDeposit(order: Pick<WholesalePayFacts, "preorder" | "depositKobo">): boolean {
  return Boolean(order.preorder) && (order.depositKobo ?? 0) > 0;
}

/** What's been paid and what's left, in kobo. */
export function wholesaleMoney(order: WholesalePayFacts): { totalKobo: number; depositKobo: number; paidKobo: number; dueKobo: number } {
  const totalKobo = toKobo(order.totalPrice);
  const depositKobo = hasDeposit(order) ? Math.min(totalKobo, order.depositKobo ?? 0) : 0;
  const settled = Boolean(order.paidAt || order.paidOutAt);
  const paidKobo = settled ? totalKobo : order.depositPaidAt ? depositKobo : 0;
  return { totalKobo, depositKobo, paidKobo, dueKobo: totalKobo - paidKobo };
}

/**
 * What the seller can pay by card now, or null: the deposit as soon as the preorder is placed (while it isn't sent
 * or cancelled); the balance once the deposit is in and the supplier said the stock is ready (and accepted it);
 * otherwise the whole order once the supplier accepted it (as before deposits). Nothing once it's all paid.
 */
export function wholesalePayStep(order: WholesalePayFacts): { step: WholesalePayStep; kobo: number } | null {
  if (order.paidAt || order.paidOutAt) return null;
  if (order.currency && order.currency !== "NGN") return null;
  const money = wholesaleMoney(order);
  if (money.totalKobo <= 0) return null;
  if (hasDeposit(order)) {
    if (!order.depositPaidAt) return UNSENT_WHOLESALE.includes(order.status) ? { step: "deposit", kobo: money.depositKobo } : null;
    if (money.dueKobo <= 0) return null;
    return order.preorderReadyAt && ACCEPTED_WHOLESALE.includes(order.status) ? { step: "balance", kobo: money.dueKobo } : null;
  }
  return ACCEPTED_WHOLESALE.includes(order.status) ? { step: "full", kobo: money.totalKobo } : null;
}

/** A preorder with a deposit is only packed and sent once it's all paid (or the supplier says they were paid). */
export function preorderBlocksShipping(order: WholesalePayFacts): boolean {
  return hasDeposit(order) && !order.paidAt && !order.paidOutAt;
}

// ─── Preorder lists ("Stock is ready") ─────────────────────────────────────────

/** Bulk orders still open (not sent, not cancelled). */
export const OPEN_PREORDER_STATUSES = ["pending", "confirmed", "processing"] as const;

/**
 * Where a bulk preorder is, for the lists: waiting for stock; stock ready with the balance still to pay; ready
 * (all paid, or nothing more to pay in the app); sent; delivered; cancelled.
 */
export type PreorderStage = "waiting" | "pay_balance" | "ready" | "shipped" | "delivered" | "cancelled";

export function wholesalePreorderStage(order: WholesalePayFacts): PreorderStage {
  if (order.status === "cancelled" || order.status === "refunded") return "cancelled";
  if (order.status === "shipped") return "shipped";
  if (order.status === "delivered") return "delivered";
  if (!order.preorderReadyAt) return "waiting";
  return hasDeposit(order) && wholesaleMoney(order).dueKobo > 0 ? "pay_balance" : "ready";
}

export interface SupplierPreorderRow extends WholesalePayFacts {
  id: string;
  quantity: number;
  sellerId: string;
  shop: string;
  createdAt: Date | string;
  product: { id: string; name: string; image: string | null; preorderEnabled: boolean; preorderShipsAt: Date | string | null; preorderLimit: number | null; preorderTaken: number; preorderDepositPct?: number | null };
}

export interface SupplierPreorderOrder {
  id: string;
  shop: string;
  sellerId: string;
  quantity: number;
  status: string;
  stage: PreorderStage;
  totalKobo: number;
  depositKobo: number;
  paidKobo: number;
  dueKobo: number;
  createdAt: string;
}

export interface SupplierPreorderGroup {
  product: { id: string; name: string; image: string | null; on: boolean; shipsOn: string | null; limit: number | null; taken: number; depositPct: number };
  /** Units on open orders. */
  units: number;
  shops: number;
  /** Open orders still waiting for "Stock is ready". */
  waiting: number;
  totalKobo: number;
  paidKobo: number;
  dueKobo: number;
  orders: SupplierPreorderOrder[];
}

const isoOf = (value: Date | string) => (value instanceof Date ? value.toISOString() : String(value));

/**
 * The supplier's open preorders, one group per product (soonest ship date first, then most units), each with its
 * shops' orders (oldest first). Sent and cancelled orders are left out.
 */
export function groupSupplierPreorders(rows: SupplierPreorderRow[]): SupplierPreorderGroup[] {
  const groups = new Map<string, SupplierPreorderGroup>();
  for (const row of rows) {
    if (!(OPEN_PREORDER_STATUSES as readonly string[]).includes(row.status)) continue;
    const money = wholesaleMoney(row);
    const group = groups.get(row.product.id) ?? {
      product: { id: row.product.id, name: row.product.name, image: row.product.image, on: row.product.preorderEnabled, shipsOn: preorderDay(row.product.preorderShipsAt), limit: row.product.preorderLimit, taken: row.product.preorderTaken, depositPct: row.product.preorderDepositPct ?? 0 },
      units: 0, shops: 0, waiting: 0, totalKobo: 0, paidKobo: 0, dueKobo: 0, orders: [],
    };
    const stage = wholesalePreorderStage(row);
    group.units += row.quantity;
    group.totalKobo += money.totalKobo;
    group.paidKobo += money.paidKobo;
    group.dueKobo += money.dueKobo;
    if (stage === "waiting") group.waiting += 1;
    group.orders.push({ id: row.id, shop: row.shop, sellerId: row.sellerId, quantity: row.quantity, status: row.status, stage, totalKobo: money.totalKobo, depositKobo: money.depositKobo, paidKobo: money.paidKobo, dueKobo: money.dueKobo, createdAt: isoOf(row.createdAt) });
    groups.set(row.product.id, group);
  }
  for (const group of groups.values()) {
    group.shops = new Set(group.orders.map((order) => order.sellerId)).size;
    group.orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
  return [...groups.values()].sort((a, b) => (a.product.shipsOn ?? "9999").localeCompare(b.product.shipsOn ?? "9999") || b.units - a.units);
}

/** The orders "Stock is ready" moves: open preorders of the product not marked ready yet. */
export function stockReadyTargets<T extends { status: string; preorder?: boolean | null; preorderReadyAt?: Date | string | null }>(orders: T[]): T[] {
  return orders.filter((order) => Boolean(order.preorder) && !order.preorderReadyAt && (OPEN_PREORDER_STATUSES as readonly string[]).includes(order.status));
}

// ─── Store preorders (shoppers preorder from the seller's store) ──────────────

/** Store order statuses a preorder list shows: unpaid, paid (waiting for the stock) and being prepared. */
export const STORE_PREORDER_OPEN = ["pending", "awaiting_payment", "paid", "processing", "packed"] as const;

export type StorePreorderStage = "unpaid" | "waiting" | "preparing";

export interface StorePreorderOrder {
  id: string;
  orderNumber: string;
  status: string;
  buyerName: string;
  items: unknown;
  createdAt: Date | string;
}

export interface StorePreorderGroup {
  productId: string;
  name: string;
  image: string | null;
  /** The earliest ship-by date on its lines. */
  shipsOn: string | null;
  units: number;
  /** Paid orders still waiting for the stock: the ones "Stock is ready" moves to processing. */
  waiting: number;
  /** Orders not paid yet ("Stock is ready" leaves them alone). */
  unpaid: number;
  orders: Array<{ id: string; orderNumber: string; buyerName: string; status: string; quantity: number; stage: StorePreorderStage; createdAt: string }>;
}

/** The stage of a store order holding a preorder line, or null once it's sent or closed. */
export function storePreorderStage(status: string): StorePreorderStage | null {
  if (status === "pending" || status === "awaiting_payment") return "unpaid";
  if (status === "paid") return "waiting";
  if (status === "processing" || status === "packed") return "preparing";
  return null;
}

function preorderLines(items: unknown): Array<Record<string, unknown> & { productId: string }> {
  if (!Array.isArray(items)) return [];
  return items.flatMap((raw) => {
    const line = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
    return line && line.preorder === true && typeof line.productId === "string" && line.productId ? [line as Record<string, unknown> & { productId: string }] : [];
  });
}

/** The seller's open store preorders, one group per product (soonest ship date first, then most units). */
export function groupStorePreorders(orders: StorePreorderOrder[]): StorePreorderGroup[] {
  const groups = new Map<string, StorePreorderGroup>();
  for (const order of orders) {
    const stage = storePreorderStage(order.status);
    if (!stage) continue;
    for (const line of preorderLines(order.items)) {
      const quantity = Math.max(1, Math.floor(Number(line.quantity) || 1));
      const shipsOn = typeof line.shipsOn === "string" && /^\d{4}-\d{2}-\d{2}$/.test(line.shipsOn) ? line.shipsOn : null;
      const group = groups.get(line.productId) ?? { productId: line.productId, name: typeof line.name === "string" && line.name ? line.name : "Product", image: typeof line.image === "string" && line.image ? line.image : null, shipsOn: null, units: 0, waiting: 0, unpaid: 0, orders: [] };
      if (shipsOn && (!group.shipsOn || shipsOn < group.shipsOn)) group.shipsOn = shipsOn;
      group.units += quantity;
      const existing = group.orders.find((row) => row.id === order.id);
      if (existing) existing.quantity += quantity;
      else {
        group.orders.push({ id: order.id, orderNumber: order.orderNumber, buyerName: order.buyerName, status: order.status, quantity, stage, createdAt: isoOf(order.createdAt) });
        if (stage === "waiting") group.waiting += 1;
        if (stage === "unpaid") group.unpaid += 1;
      }
      groups.set(line.productId, group);
    }
  }
  for (const group of groups.values()) group.orders.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return [...groups.values()].sort((a, b) => (a.shipsOn ?? "9999").localeCompare(b.shipsOn ?? "9999") || b.units - a.units);
}

/** Store orders "Stock is ready" moves to processing for a product: paid ones holding a preorder line of it. */
export function storeStockReadyTargets<T extends { status: string; items: unknown }>(orders: T[], productId: string): T[] {
  return orders.filter((order) => order.status === "paid" && preorderLines(order.items).some((line) => line.productId === productId));
}
