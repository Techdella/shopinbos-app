// Money and labels for Find products, with no imports so tests/mobile-app.test.mjs can run them in Node.
// Copies of the pure helpers in src/lib/marketplace/find.ts (the web's Find products); the test checks both
// give the same answers, so the app's "You keep" always matches the web's.

export interface FindTier {
  minQty: number;
  maxQty?: number;
  price: number;
}

/** Card payment fee on a sale (Paystack, local cards): 1.5% plus ₦100, the ₦100 waived under ₦2,500, capped at ₦2,000. */
export function paymentFee(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const fee = amount * 0.015 + (amount >= 2500 ? 100 : 0);
  return Math.round(Math.min(fee, 2000));
}

/** What happens to one sale at `price` of a product the supplier sells for `cost`. Delivery is added on top. */
export function saleBreakdown(price: number, cost: number) {
  const shopperPays = Math.max(0, Math.round(price));
  const supplierGets = Math.max(0, Math.round(cost));
  const fee = paymentFee(shopperPays);
  const keep = shopperPays - supplierGets - fee;
  return { shopperPays, supplierGets, fee, keep, keepPct: shopperPays > 0 ? Math.round((keep / shopperPays) * 100) : 0 };
}

/** Steps for the selling-price stepper: ₦100 under ₦5,000, ₦500 under ₦50,000, ₦1,000 above. */
export function priceStep(price: number) {
  if (price < 5000) return 100;
  if (price < 50000) return 500;
  return 1000;
}

/** Selling prices the stepper allows: above cost plus fees, and not silly. */
export function clampSellingPrice(price: number, cost: number) {
  const floor = Math.ceil((cost + paymentFee(cost) + 100) / 100) * 100;
  const ceiling = Math.max(floor, Math.round(cost * 10));
  return Math.min(ceiling, Math.max(floor, Math.round(price)));
}

/** Unit price for a wholesale quantity, from the supplier's tiers (falls back on the base price). */
export function tierPrice(tiers: FindTier[], quantity: number, base: number) {
  const match = [...tiers]
    .sort((a, b) => b.minQty - a.minQty)
    .find((tier) => quantity >= tier.minQty && (tier.maxQty === undefined || quantity <= tier.maxQty));
  return match?.price ?? base;
}

export function parsePricingTiers(value: unknown): FindTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((tier) => (tier && typeof tier === "object" ? (tier as Record<string, unknown>) : {}))
    .filter((tier) => Number(tier.minQty) >= 1 && Number(tier.price) > 0)
    .map((tier) => ({
      minQty: Math.floor(Number(tier.minQty)),
      ...(Number(tier.maxQty) >= Number(tier.minQty) ? { maxQty: Math.floor(Number(tier.maxQty)) } : {}),
      price: Number(tier.price),
    }))
    .sort((a, b) => a.minQty - b.minQty);
}

/** "24 hours" → "Ships in 24 hours"; "Same day in Lagos" stays as it is. */
export function shipsLabel(processingTime: string | null | undefined, t?: { dynamic(key: string, fallback?: string, vars?: Record<string, string>): string }) {
  const text = (processingTime ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (/^(ships|same day|next day|ready)/i.test(text)) return text.charAt(0).toUpperCase() + text.slice(1);
  return t ? t.dynamic("ships", `Ships in ${text}`, { time: text }) : `Ships in ${text}`;
}

/** Marketplace category names are long ("Electronics & Gadgets"); chips use one word. */
export function shortCategory(name: string | null | undefined) {
  const text = (name ?? "").trim();
  if (!text) return "Other";
  const rules: Array<[RegExp, string]> = [
    [/shoe|footwear|sneaker/i, "Shoes"],
    [/gadget|electronic|phone/i, "Gadgets"],
    [/food|grocer|snack/i, "Food"],
    [/home|living|furniture/i, "Home"],
    [/beauty|skin|hair/i, "Beauty"],
    [/fashion|cloth|apparel/i, "Fashion"],
    [/ankara|fabric|textile/i, "Fabrics"],
    [/health|wellness/i, "Health"],
    [/kid|baby/i, "Kids"],
    [/wholesale/i, "Wholesale"],
  ];
  return rules.find(([pattern]) => pattern.test(text))?.[1] ?? text.split(/\s+(?:&|and)\s+/)[0];
}

/** Chip order: the usual categories first, then the rest alphabetically. */
export function sortCategories(names: string[]) {
  const order = ["Shoes", "Fashion", "Home", "Gadgets", "Food", "Beauty"];
  return [...new Set(names)].sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}
