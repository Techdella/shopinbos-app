export interface RedeemableCode {
  status: string;
  startsAt?: Date | null;
  expiresAt: Date | null;
  maxUses: number | null;
  usedCount: number;
  minOrder: number | null;
}

/** Returns why a discount or coupon cannot be used, or null when it can be redeemed. */
export function redemptionError(code: RedeemableCode, subtotal: number, now = new Date()): string | null {
  if (code.status !== "active") return "This code is not active";
  if (code.startsAt && now < code.startsAt) return "This code is not active yet";
  if (code.expiresAt && now > code.expiresAt) return "This code has expired";
  if (code.maxUses && code.maxUses > 0 && code.usedCount >= code.maxUses) return "This code has reached its usage limit";
  if (code.minOrder && subtotal < code.minOrder) return `Minimum order of ${code.minOrder} required`;
  return null;
}

// ─── Discount settings and maths (marketing) ──────────────────────────────────
// Discount.config holds what the columns don't: automatic discounts (no code needed), buy X get Y,
// product scope, a segment, once per customer. The checkout uses discountAmount() / bestAutomaticDiscount().

export interface DiscountConfig {
  /** Applies at checkout without a code. */
  automatic: boolean;
  /** Buy X get Y (type "bogo"): buy this many… */
  buyQuantity: number;
  /** …get this many of the cheapest qualifying items… */
  getQuantity: number;
  /** …at this percent off (100 = free). Falls back to Discount.value. */
  getPercent: number | null;
  /** Only these products count (empty = everything). */
  productIds: string[];
  /** Only customers in this segment (checked where the checkout knows the buyer). */
  segmentId: string | null;
  /** One use per customer email. */
  oncePerCustomer: boolean;
}

export function parseDiscountConfig(raw: unknown): DiscountConfig {
  const c = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const int = (value: unknown, fallback: number) => (Number.isFinite(Number(value)) && Number(value) >= 1 ? Math.floor(Number(value)) : fallback);
  return {
    automatic: c.automatic === true,
    buyQuantity: int(c.buyQuantity, 1),
    getQuantity: int(c.getQuantity, 1),
    getPercent: Number(c.getPercent) > 0 ? Math.min(100, Number(c.getPercent)) : null,
    productIds: Array.isArray(c.productIds) ? c.productIds.filter((id): id is string => typeof id === "string").slice(0, 200) : [],
    segmentId: typeof c.segmentId === "string" && c.segmentId ? c.segmentId : null,
    oncePerCustomer: c.oncePerCustomer === true,
  };
}

export interface DiscountLine {
  productId: string;
  price: number;
  quantity: number;
}

export interface DiscountRule {
  type: string;
  value: number;
  config?: unknown;
}

/** Naira off an order for one discount. Never more than the qualifying items (or the delivery fee). */
export function discountAmount(rule: DiscountRule, items: DiscountLine[], shippingFee: number): number {
  const config = parseDiscountConfig(rule.config);
  const scoped = config.productIds.length ? items.filter((item) => config.productIds.includes(item.productId)) : items;
  const base = scoped.reduce((sum, item) => sum + item.price * item.quantity, 0);
  if (base <= 0 && rule.type !== "free_shipping") return 0;
  let amount = 0;
  switch (rule.type) {
    case "percentage":
      amount = base * (Math.min(100, Math.max(0, rule.value)) / 100);
      break;
    case "fixed_amount":
      amount = Math.min(base, Math.max(0, rule.value));
      break;
    case "free_shipping":
      amount = Math.max(0, shippingFee);
      break;
    case "bogo": {
      // Every (buy + get) units, the cheapest `get` units are discounted.
      const units = scoped.flatMap((item) => Array.from({ length: Math.max(0, Math.floor(item.quantity)) }, () => item.price)).sort((a, b) => b - a);
      const group = config.buyQuantity + config.getQuantity;
      const freeUnits = Math.floor(units.length / group) * config.getQuantity;
      const percent = config.getPercent ?? (rule.value > 0 ? Math.min(100, rule.value) : 100);
      amount = units.slice(units.length - freeUnits).reduce((sum, price) => sum + price, 0) * (percent / 100);
      break;
    }
  }
  return Math.round(amount * 100) / 100;
}

/** The automatic discount that saves the shopper the most, among those that can be redeemed now. */
export function bestAutomaticDiscount<T extends DiscountRule & RedeemableCode & { config?: unknown }>(
  discounts: T[],
  items: DiscountLine[],
  shippingFee: number,
  now = new Date(),
): { discount: T; amount: number } | null {
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  let best: { discount: T; amount: number } | null = null;
  for (const discount of discounts) {
    if (!parseDiscountConfig(discount.config).automatic || redemptionError(discount, subtotal, now)) continue;
    const amount = discountAmount(discount, items, shippingFee);
    if (amount > 0 && (!best || amount > best.amount)) best = { discount, amount };
  }
  return best;
}

/** "20% off", "Buy 2 get 1 free", "Free delivery". */
export function describeDiscount(rule: DiscountRule, money: (n: number) => string = (n) => `₦${n.toLocaleString("en-NG")}`) {
  const config = parseDiscountConfig(rule.config);
  switch (rule.type) {
    case "percentage":
      return `${rule.value}% off`;
    case "fixed_amount":
      return `${money(rule.value)} off`;
    case "free_shipping":
      return "Free delivery";
    case "bogo": {
      const percent = config.getPercent ?? (rule.value > 0 ? Math.min(100, rule.value) : 100);
      return `Buy ${config.buyQuantity} get ${config.getQuantity} ${percent >= 100 ? "free" : `${percent}% off`}`;
    }
    default:
      return String(rule.value);
  }
}
