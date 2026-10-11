// Creators and affiliates: a creator shares the store link with ?aff=<code>; orders from it earn them a share
// once delivered. The seller pays them (usually Fridays) and marks it paid. Pure helpers, unit-tested.

export const DEFAULT_COMMISSION_RATE = 10;
export const AFFILIATE_WINDOW_DAYS = 30;

/** A short, readable code from a name: "Tolu Adeyemi" → "tolu", plus a suffix when taken. */
export function affiliateCode(name: string, taken: Iterable<string> = []) {
  const base = name.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "").slice(0, 12) || "creator";
  const used = new Set([...taken].map((code) => code.toLowerCase()));
  if (!used.has(base)) return base;
  for (let n = 2; n < 1000; n++) if (!used.has(`${base}${n}`)) return `${base}${n}`;
  return `${base}${Date.now().toString(36)}`;
}

/** Normalises ?aff= input; null when it can't be a code. */
export function cleanAffiliateCode(value: string | null | undefined): string | null {
  const code = value?.trim().toLowerCase() ?? "";
  return /^[a-z0-9_-]{2,32}$/.test(code) ? code : null;
}

/** Commission on the item total after discounts; delivery fees don't count. Whole naira. */
export function commissionFor(subtotal: number, discount: number, ratePercent: number) {
  const base = Math.max(0, (Number(subtotal) || 0) - (Number(discount) || 0));
  const rate = Math.min(100, Math.max(0, Number(ratePercent) || 0));
  return Math.round((base * rate) / 100);
}

export interface AffiliateOrder {
  status: string;
  affiliateCommission: number | null;
  affiliatePaidAt: Date | string | null;
  total: number;
}

const CLOSED = new Set(["cancelled", "refunded", "returned"]);

/** pending = not delivered yet; owed = delivered and not paid out; paid = paid out. Sales count delivered orders. */
export function affiliateTotals(orders: AffiliateOrder[]) {
  let pending = 0;
  let owed = 0;
  let paid = 0;
  let sales = 0;
  let deliveredOrders = 0;
  for (const order of orders) {
    const commission = Number(order.affiliateCommission) || 0;
    if (CLOSED.has(order.status)) continue;
    if (order.status !== "delivered") {
      pending += commission;
      continue;
    }
    deliveredOrders += 1;
    sales += Number(order.total) || 0;
    if (order.affiliatePaidAt) paid += commission;
    else owed += commission;
  }
  return { pending, owed, paid, sales, deliveredOrders, orders: orders.filter((order) => !CLOSED.has(order.status)).length };
}

/** The next Friday (today if it's Friday), for "pay on Friday" copy. Lagos time. */
export function nextPayday(now = new Date()) {
  const lagos = new Date(now.getTime() + 3_600_000);
  const days = (5 - lagos.getUTCDay() + 7) % 7;
  return new Date(Date.UTC(lagos.getUTCFullYear(), lagos.getUTCMonth(), lagos.getUTCDate() + days, 12));
}
