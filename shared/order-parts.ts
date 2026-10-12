// A shop order sent in more than one parcel, and sending a supplier's part to another supplier when they don't
// accept in time (build spec 7.2: "REROUTED to next supplier with same product (max 2)"). Shared by the server,
// the web seller pages and the mobile app. Pure (no imports) so tests/multi-supplier-reroute.test.mjs can load it.
//
// Parts: each supplier order on the shop order is a parcel, and so are the lines the seller sends from their own
// stock. The shop order is "shipped" only when every parcel has left and "delivered" only when every parcel
// arrived; until then it stays "processing" and everyone sees "2 of 3 parcels sent".

// ─── Parts ────────────────────────────────────────────────────────────────────

/** waiting: the supplier hasn't said yes; preparing: accepted / being packed; problem: declined or no answer. */
export type PartState = "waiting" | "preparing" | "sent" | "delivered" | "problem";

export interface SupplierPartRow {
  id: string;
  status: string;
  replacesId?: string | null;
  supplierName?: string | null;
}

export interface OrderPartsInput {
  supplierOrders: SupplierPartRow[];
  /** Lines the seller sends from their own stock (not covered by any supplier order). */
  ownLines: number;
  ownShippedAt?: Date | string | null;
  ownDeliveredAt?: Date | string | null;
}

export interface OrderPart {
  key: string;
  kind: "supplier" | "own";
  supplierOrderId: string | null;
  status: string;
  state: PartState;
  name: string;
  label: string;
}

export interface OrderPartsSummary {
  parts: OrderPart[];
  total: number;
  sent: number;
  delivered: number;
  problems: number;
  /** Some parcels have left, not all. */
  partial: boolean;
  /** "2 of 3 parcels sent" (null for a one-parcel order). */
  line: string | null;
}

/** A supplier order's state as a parcel, or null when it isn't one (cancelled, or undone). */
export function supplierPartState(status: string): PartState | null {
  switch (status) {
    case "pending":
      return "waiting";
    case "accepted":
      return "preparing";
    case "shipped":
      return "sent";
    case "delivered":
      return "delivered";
    case "rejected":
    case "expired":
      return "problem";
    default:
      return null;
  }
}

/** The order that took over from this one (an automatic switch nobody undid), if any. */
export function activeReplacement<T extends SupplierPartRow>(orders: T[], id: string): T | null {
  return orders.find((row) => row.replacesId === id && row.status !== "cancelled") ?? null;
}

function partLabel(kind: "supplier" | "own", state: PartState, status: string, name: string) {
  if (kind === "own") return ({ waiting: "You send this part", preparing: "You send this part", sent: "You sent it", delivered: "Delivered", problem: "Needs you" } as const)[state];
  switch (state) {
    case "waiting":
      return `Waiting for ${name} to accept`;
    case "preparing":
      return `${name} is packing it`;
    case "sent":
      return "On the way";
    case "delivered":
      return "Delivered";
    default:
      return status === "rejected" ? `${name} can't send it` : `${name} didn't accept in time`;
  }
}

/** "2 of 3 parcels sent", "All 3 parcels sent", "1 of 3 parcels delivered"; null for one parcel. */
export function partsLine(summary: { total: number; sent: number; delivered: number }) {
  if (summary.total < 2) return null;
  if (summary.delivered === summary.total) return `All ${summary.total} parcels delivered`;
  if (summary.sent === summary.total) return summary.delivered > 0 ? `${summary.delivered} of ${summary.total} parcels delivered` : `All ${summary.total} parcels sent`;
  return `${summary.sent} of ${summary.total} parcels sent`;
}

/**
 * The parcels of a shop order. Cancelled supplier orders are left out, and so is an expired one whose lines went
 * to another supplier (the new supplier's order is the parcel now).
 */
export function orderParts(input: OrderPartsInput): OrderPartsSummary {
  const parts: OrderPart[] = [];
  for (const row of input.supplierOrders) {
    const state = supplierPartState(row.status);
    if (!state) continue;
    if (state === "problem" && activeReplacement(input.supplierOrders, row.id)) continue;
    const name = String(row.supplierName ?? "").trim() || "The supplier";
    parts.push({ key: row.id, kind: "supplier", supplierOrderId: row.id, status: row.status, state, name, label: partLabel("supplier", state, row.status, name) });
  }
  if (input.ownLines > 0) {
    const state: PartState = input.ownDeliveredAt ? "delivered" : input.ownShippedAt ? "sent" : "waiting";
    parts.push({ key: "own", kind: "own", supplierOrderId: null, status: state, state, name: "You", label: partLabel("own", state, state, "You") });
  }
  const sent = parts.filter((part) => part.state === "sent" || part.state === "delivered").length;
  const delivered = parts.filter((part) => part.state === "delivered").length;
  const problems = parts.filter((part) => part.state === "problem").length;
  const total = parts.length;
  return { parts, total, sent, delivered, problems, partial: sent > 0 && sent < total, line: partsLine({ total, sent, delivered }) };
}

const RETAIL_PROGRESS = ["pending", "awaiting_payment", "paid", "processing", "packed", "shipped", "delivered"];

/**
 * Where the shop order should be, from its parts, or null to leave it. Only forward: "shipped" once every part
 * has left, "delivered" once every part arrived, otherwise "processing" once anyone is on it. A part that was
 * declined or not accepted keeps it at "processing" for the seller to decide.
 */
export function retailStatusFromParts(retailStatus: string, summary: Pick<OrderPartsSummary, "parts" | "total" | "sent" | "delivered" | "problems">): "processing" | "shipped" | "delivered" | null {
  const current = RETAIL_PROGRESS.indexOf(retailStatus);
  if (current === -1 || summary.total === 0) return null;
  const forward = (target: "processing" | "shipped" | "delivered") => (RETAIL_PROGRESS.indexOf(target) > current ? target : null);
  if (summary.problems === 0) {
    if (summary.delivered === summary.total) return forward("delivered");
    if (summary.sent === summary.total) return forward("shipped");
  }
  if (summary.parts.some((part) => part.kind === "supplier" && part.state !== "waiting" && part.state !== "problem") || summary.sent > 0) return forward("processing");
  return null;
}

/**
 * The order's stage for the seller while suppliers send it ("Needs a rider" would be wrong: there's nothing for
 * the seller to send). Null when the seller still sends a part of their own, or when the order's own stage is right.
 */
export function stageFromParts(retailStatus: string, summary: Pick<OrderPartsSummary, "parts" | "total" | "sent" | "problems" | "line">): { label: string; tone: "accent" | "success" | "warning" | "muted" | "danger" } | null {
  if (!["pending", "awaiting_payment", "paid", "processing", "packed"].includes(retailStatus) || summary.total === 0) return null;
  if (summary.parts.some((part) => part.kind === "own" && part.state === "waiting") && summary.problems === 0) return null;
  if (summary.problems > 0) return { label: "Needs you", tone: "danger" };
  if (summary.sent > 0) return { label: summary.line ?? "Partly sent", tone: "accent" };
  if (["pending", "awaiting_payment"].includes(retailStatus)) return null;
  if (summary.parts.some((part) => part.state === "preparing")) return { label: "Supplier is packing it", tone: "warning" };
  return { label: "Waiting for the supplier", tone: "warning" };
}

/** What the customer sees while some parcels are on the way and others aren't. */
export const PARTLY_SENT_TEXT = "Part of your order is on its way";

export function customerProgress(order: { status: string; partlySentAt?: Date | string | null }) {
  if (order.partlySentAt && !["shipped", "delivered", "cancelled", "refunded", "returned"].includes(order.status)) return PARTLY_SENT_TEXT;
  return null;
}

// ─── Switching to another supplier ────────────────────────────────────────────

/** Never more than two automatic switches on one shop order. */
export const MAX_SWITCHES_PER_ORDER = 2;

/** The replacement order's idempotency key: one per expired supplier order, so a cron re-run can't make two. */
export function switchKey(expiredSupplierOrderId: string) {
  return `switch:${expiredSupplierOrderId}`;
}

export interface SwitchSettings {
  auto: boolean;
  rule: "cost" | "margin";
  maxIncreasePct: number;
  minMarginPct: number;
}

export const DEFAULT_SWITCH_SETTINGS: SwitchSettings = { auto: true, rule: "cost", maxIncreasePct: 10, minMarginPct: 20 };

const clampInt = (value: unknown, min: number, max: number, fallback: number) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(max, Math.max(min, number)) : fallback;
};

/** The store's switching setting (Store.autoSwitchSupplier, switchCostRule, switchMaxIncreasePct, switchMinMarginPct). */
export function switchSettings(store: { autoSwitchSupplier?: boolean | null; switchCostRule?: string | null; switchMaxIncreasePct?: number | null; switchMinMarginPct?: number | null } | null | undefined): SwitchSettings {
  return {
    auto: store?.autoSwitchSupplier !== false,
    rule: store?.switchCostRule === "margin" ? "margin" : "cost",
    maxIncreasePct: clampInt(store?.switchMaxIncreasePct, 0, 100, DEFAULT_SWITCH_SETTINGS.maxIncreasePct),
    minMarginPct: clampInt(store?.switchMinMarginPct, 0, 90, DEFAULT_SWITCH_SETTINGS.minMarginPct),
  };
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * The most the seller will pay a new supplier per unit: at most maxIncreasePct above the original cost ("cost"),
 * or the seller's price minus their minimum margin ("margin"; falls back to "cost" when the price isn't known).
 * Never more than the seller's price: a switch never makes a sale lose money.
 */
export function maxUnitCost(line: { unitCost: number; sellPrice?: number | null }, settings: SwitchSettings) {
  const price = Number(line.sellPrice) || 0;
  const cost = Number(line.unitCost) || 0;
  const limit = settings.rule === "margin" && price > 0 ? price * (1 - settings.minMarginPct / 100) : cost * (1 + settings.maxIncreasePct / 100);
  return round2(price > 0 ? Math.min(limit, price) : limit);
}

export function withinCostLimit(newUnitCost: number, line: { unitCost: number; sellPrice?: number | null }, settings: SwitchSettings) {
  return newUnitCost <= maxUnitCost(line, settings) + 0.001;
}

// Names: the same product sold by another supplier.

const NOISE = new Set(["the", "and", "for", "with", "of", "a", "an", "in", "new", "premium", "quality", "original", "assorted", "size", "sizes", "colour", "colours", "color", "colors", "style", "styles"]);
const GENDER: Record<string, string> = { women: "women", womens: "women", woman: "women", ladies: "women", lady: "women", female: "women", men: "men", mens: "men", man: "men", male: "men", kids: "kids", children: "kids", girls: "kids", boys: "kids", unisex: "unisex" };

export function nameWords(name: string) {
  return String(name ?? "")
    .toLowerCase()
    .replace(/['’]s\b/g, "s")
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length > 1 && !NOISE.has(word))
    .map((word) => (word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word));
}

/** Shared words over the shorter name's words (0..1); 0 when they're for different people (women's vs men's). */
export function nameSimilarity(a: string, b: string) {
  const left = new Set(nameWords(a));
  const right = new Set(nameWords(b));
  if (!left.size || !right.size) return 0;
  const genders = (words: Set<string>) => new Set([...words].map((word) => GENDER[word] ?? GENDER[`${word}s`]).filter(Boolean));
  const gl = genders(left);
  const gr = genders(right);
  if (gl.size && gr.size && ![...gl].some((g) => gr.has(g))) return 0;
  const shared = [...left].filter((word) => right.has(word)).length;
  if (shared < 2) return 0;
  return shared / Math.min(left.size, right.size);
}

export const NAME_MATCH_MIN = 0.6;

export interface ProductRef {
  id: string;
  name: string;
  categoryId: string | null;
  familyKey?: string | null;
}

/**
 * How another supplier's product matches the one the order was for: "family" (the same listing family, or it
 * names that product as its own), "similar" (same category and a close name), or null.
 */
export function productMatch(original: ProductRef, candidate: ProductRef): "family" | "similar" | null {
  if (candidate.id === original.id) return null;
  const family = original.familyKey?.trim() || null;
  const theirs = candidate.familyKey?.trim() || null;
  if ((family && theirs === family) || theirs === original.id || (family && family === candidate.id)) return "family";
  if (original.categoryId && candidate.categoryId === original.categoryId && nameSimilarity(original.name, candidate.name) >= NAME_MATCH_MIN) return "similar";
  return null;
}

// Sizes and colours.

const SIZE = /^(xxs|xs|s|m|l|xl|xxl|xxxl|[2-6]xl|\d{1,3}(\.\d)?|size\s*\S+|one size|free size|\d+(\.\d+)?\s?(ml|g|kg|l|cm|m|yards?|inch(es)?|in))$/i;
const norm = (value: unknown) => String(value ?? "").toLowerCase().replace(/^size\s*/, "").replace(/\s+/g, " ").trim();

export interface VariantWanted {
  size: string | null;
  color: string | null;
}

/** "Black / M" → { size: "m", color: "black" }; null for no variant. */
export function parseVariantLabel(label: string | null | undefined): VariantWanted | null {
  const pieces = String(label ?? "").split(/[/|,]/).map((piece) => piece.trim()).filter(Boolean);
  if (!pieces.length) return null;
  let size: string | null = null;
  let color: string | null = null;
  for (const piece of pieces) {
    if (!size && SIZE.test(piece)) size = norm(piece);
    else if (!color) color = norm(piece);
  }
  return size || color ? { size, color } : null;
}

/** The sizes and colours a supplier product lists: [{ size, color }] (also "colour"). */
export function productVariants(value: unknown): VariantWanted[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const row = raw as Record<string, unknown>;
    const size = norm(row.size) || null;
    const color = norm(row.color ?? row.colour) || null;
    return size || color ? [{ size, color }] : [];
  });
}

/**
 * Whether a product has the size and colour the customer ordered. Nothing ordered: yes. A product listing no
 * sizes or colours only counts for the same listing family (it is the same product); a look-alike must list them.
 */
export function variantAvailable(wanted: VariantWanted | null, variants: unknown, match: "family" | "similar") {
  if (!wanted) return true;
  const listed = productVariants(variants);
  if (!listed.length) return match === "family";
  return listed.some((variant) => (!wanted.size || variant.size === wanted.size) && (!wanted.color || variant.color === wanted.color));
}

// Choosing the other supplier.

export interface SwitchLine {
  storeProductId: string;
  supplierProductId: string;
  name: string;
  variant: string | null;
  /** Size and colour when the store product's variants say (else parsed from `variant`). */
  wanted?: VariantWanted | null;
  quantity: number;
  unitCost: number;
  /** What the customer paid per unit (the seller's price). */
  sellPrice: number;
  image?: string | null;
}

export interface SwitchCandidate extends ProductRef {
  supplierId: string;
  supplierName: string;
  supplierVerified: boolean;
  supplierActive: boolean;
  published: boolean;
  dropship: boolean;
  stock: number;
  wholesalePrice: number;
  variants?: unknown;
  trustScore?: number;
  missedOrders?: number;
  sameCity?: boolean;
  image?: string | null;
}

export interface SwitchChoice {
  supplierId: string;
  supplierName: string;
  lines: Array<SwitchLine & { newSupplierProductId: string; newUnitCost: number; match: "family" | "similar"; newImage: string | null }>;
  costBefore: number;
  costAfter: number;
}

/** Why a supplier can't take the lines (for logs and the tests). */
export type SkipReason = "missed" | "unverified" | "no_match" | "stock" | "price";

/**
 * The best other supplier for all of an expired order's lines, or null. Each line needs a product from the same
 * supplier that matches, has the size and colour, has the stock and stays within the cost limit. Suppliers who
 * already missed this order are never picked. Best = most same-family matches, then trust, fewest missed orders,
 * same city, lowest cost.
 */
export function chooseAlternative(input: { lines: SwitchLine[]; originals: Map<string, ProductRef>; candidates: SwitchCandidate[]; excludedSupplierIds: Iterable<string>; settings: SwitchSettings }): { choice: SwitchChoice | null; skipped: Record<string, SkipReason> } {
  const excluded = new Set(input.excludedSupplierIds);
  const bySupplier = new Map<string, SwitchCandidate[]>();
  for (const candidate of input.candidates) bySupplier.set(candidate.supplierId, [...(bySupplier.get(candidate.supplierId) ?? []), candidate]);
  const skipped: Record<string, SkipReason> = {};
  const options: Array<SwitchChoice & { family: number; trust: number; missed: number; sameCity: boolean }> = [];
  const costBefore = round2(input.lines.reduce((sum, line) => sum + line.unitCost * line.quantity, 0));

  for (const [supplierId, products] of bySupplier) {
    if (excluded.has(supplierId)) {
      skipped[supplierId] = "missed";
      continue;
    }
    const first = products[0];
    if (!first.supplierVerified || !first.supplierActive) {
      skipped[supplierId] = "unverified";
      continue;
    }
    const picked: SwitchChoice["lines"] = [];
    let reason: SkipReason | null = null;
    const taken = new Map<string, number>();
    for (const line of input.lines) {
      const original = input.originals.get(line.supplierProductId) ?? { id: line.supplierProductId, name: line.name, categoryId: null };
      const wanted = line.wanted !== undefined ? line.wanted : parseVariantLabel(line.variant);
      let lineReason: SkipReason = "no_match";
      let best: { product: SwitchCandidate; match: "family" | "similar" } | null = null;
      for (const product of products) {
        const match = productMatch(original, product);
        if (!match || !product.published || !product.dropship || !variantAvailable(wanted, product.variants, match)) continue;
        if (product.stock - (taken.get(product.id) ?? 0) < line.quantity) {
          lineReason = "stock";
          continue;
        }
        if (!withinCostLimit(product.wholesalePrice, line, input.settings)) {
          if (lineReason !== "stock") lineReason = "price";
          continue;
        }
        const better = !best || (match === "family" && best.match !== "family") || (match === best.match && product.wholesalePrice < best.product.wholesalePrice);
        if (better) best = { product, match };
      }
      if (!best) {
        reason = lineReason;
        break;
      }
      taken.set(best.product.id, (taken.get(best.product.id) ?? 0) + line.quantity);
      picked.push({ ...line, newSupplierProductId: best.product.id, newUnitCost: best.product.wholesalePrice, match: best.match, newImage: best.product.image ?? line.image ?? null });
    }
    if (reason) {
      skipped[supplierId] = reason;
      continue;
    }
    options.push({
      supplierId,
      supplierName: first.supplierName,
      lines: picked,
      costBefore,
      costAfter: round2(picked.reduce((sum, line) => sum + line.newUnitCost * line.quantity, 0)),
      family: picked.filter((line) => line.match === "family").length,
      trust: Number(first.trustScore) || 0,
      missed: Number(first.missedOrders) || 0,
      sameCity: Boolean(first.sameCity),
    });
  }
  options.sort((a, b) => b.family - a.family || b.trust - a.trust || a.missed - b.missed || Number(b.sameCity) - Number(a.sameCity) || a.costAfter - b.costAfter || a.supplierId.localeCompare(b.supplierId));
  const best = options[0];
  if (!best) return { choice: null, skipped };
  const { family: _family, trust: _trust, missed: _missed, sameCity: _sameCity, ...choice } = best;
  void _family;
  void _trust;
  void _missed;
  void _sameCity;
  return { choice, skipped };
}

/** Suppliers who already missed (didn't accept in time) or declined this shop order: never sent it again. */
export function suppliersWhoMissed(orders: Array<{ supplierId: string; status: string }>) {
  return [...new Set(orders.filter((row) => row.status === "expired" || row.status === "rejected").map((row) => row.supplierId))];
}

export type SwitchBlock = "off" | "limit" | null;

/** Whether an automatic switch may happen: the shop has it on and the order hasn't been switched twice already. */
export function switchAllowed(input: { settings: SwitchSettings; switchesSoFar: number }): SwitchBlock {
  if (!input.settings.auto) return "off";
  if (input.switchesSoFar >= MAX_SWITCHES_PER_ORDER) return "limit";
  return null;
}

/** Undo is there until the new supplier accepts. */
export function canUndoSwitch(replacement: { status: string; replacesId?: string | null; undoneAt?: Date | string | null } | null | undefined) {
  return Boolean(replacement && replacement.replacesId && !replacement.undoneAt && replacement.status === "pending");
}

const defaultMoney = (amount: number) => `₦${Math.round(amount).toLocaleString("en-NG")}`;

/** "Same price for you." / "It costs you ₦500 more." / "It costs you ₦300 less." */
export function costChangeWords(costBefore: number, costAfter: number, money: (amount: number) => string = defaultMoney) {
  const diff = round2(costAfter - costBefore);
  if (Math.abs(diff) < 1) return "Same price for you.";
  return diff > 0 ? `It costs you ${money(diff)} more.` : `It costs you ${money(-diff)} less.`;
}

/** "Adaeze Fabrics didn't accept in time, so we sent it to Lagos Textiles instead. Same price for you." */
export function switchedMessage(input: { fromName: string; toName: string; costBefore: number; costAfter: number }, money?: (amount: number) => string) {
  return `${input.fromName} didn't accept in time, so we sent it to ${input.toName} instead. ${costChangeWords(input.costBefore, input.costAfter, money)}`;
}
