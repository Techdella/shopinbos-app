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

/** The round tile a category gets on Find (icon and tint); categories outside the usual six share a plain one. */
export function categoryLook(name: string): { icon: "tag" | "bag" | "home" | "phone" | "box" | "sparkle" | "grid"; tone: "lime" | "peach" | "sky" | "lilac" | "butter" | "mint" | "gray" } {
  const looks = {
    Shoes: { icon: "tag", tone: "lime" },
    Fashion: { icon: "bag", tone: "peach" },
    Home: { icon: "home", tone: "sky" },
    Gadgets: { icon: "phone", tone: "lilac" },
    Food: { icon: "box", tone: "butter" },
    Beauty: { icon: "sparkle", tone: "mint" },
  } as const;
  return looks[name as keyof typeof looks] ?? { icon: "grid", tone: "gray" };
}

// ─── Filters (the list view's chip row and Filters sheet) ────────────────────

/** What the seller pays the supplier per unit, in naira bands. */
export const FIND_PRICE_BANDS = [
  { key: "under5", min: 0, max: 5000 },
  { key: "5to20", min: 5000, max: 20000 },
  { key: "20to50", min: 20000, max: 50000 },
  { key: "over50", min: 50000, max: Infinity },
] as const;

export type FindPriceBand = (typeof FIND_PRICE_BANDS)[number]["key"];

export interface FindFilters {
  q: string;
  category: string;
  /** "" any, "dropship" (the supplier sends each order) or "wholesale" (buy in bulk). */
  way: "" | "dropship" | "wholesale";
  price: "" | FindPriceBand;
  /** A supplier's city, or "" for anywhere. */
  city: string;
  verified: boolean;
  /** "near": within NEAR_ME_KM of the seller; "state": the supplier is in the seller's state (delivers there). */
  near?: "" | "near" | "state" | "customers";
  /** Hide what's already in the shop (the screen applies it with the shop's ids: withoutAdded). */
  notInShop?: boolean;
}

export const NO_FIND_FILTERS: FindFilters = { q: "", category: "", way: "", price: "", city: "", verified: false, near: "", notInShop: false };

/** "Near me": a supplier this close (Find shows suppliers up to 50 km away). */
export const NEAR_ME_KM = 15;

interface Filterable {
  name: string;
  description: string;
  category: string;
  cost: number;
  dropship: boolean;
  wholesale: boolean;
  supplier: { name: string; city: string; verificationStatus: string; km?: number | null; sameState?: boolean; nearCustomers?: boolean };
}

/** Every word must appear (plurals folded), in the name, description, category or the supplier. */
export function findMatches(product: Filterable, q: string) {
  const words = q.toLowerCase().split(/[\s,]+/).filter((word) => word.length > 1);
  if (!words.length) return true;
  const haystack = [product.name, product.description, product.category, product.supplier.name, product.supplier.city].join(" ").toLowerCase();
  return words.every((word) => haystack.includes(word.replace(/(es|s)$/, "")));
}

export function filterFind<P extends Filterable>(products: readonly P[], filters: FindFilters): P[] {
  const band = FIND_PRICE_BANDS.find((item) => item.key === filters.price);
  const city = filters.city.trim().toLowerCase();
  return products.filter(
    (product) =>
      (!filters.category || product.category === filters.category) &&
      (filters.way !== "dropship" || product.dropship) &&
      (filters.way !== "wholesale" || product.wholesale) &&
      (!band || (product.cost >= band.min && product.cost < band.max)) &&
      (!city || product.supplier.city.trim().toLowerCase() === city) &&
      (!filters.verified || product.supplier.verificationStatus === "verified") &&
      // No distance means the city matched by name (Find only lists near suppliers), so it counts as near.
      (filters.near !== "near" || product.supplier.km == null || product.supplier.km <= NEAR_ME_KM) &&
      (filters.near !== "state" || product.supplier.sameState === true) &&
      // Near where the seller's customers are (shared/near-customers.ts), worked out by the server.
      (filters.near !== "customers" || product.supplier.nearCustomers === true) &&
      findMatches(product, filters.q),
  );
}

/** "Not in my shop yet": drops what the shop already has when the filter is on. */
export function withoutAdded<P extends { id: string }>(products: readonly P[], added: ReadonlySet<string>, on: boolean | undefined): P[] {
  return on ? products.filter((product) => !added.has(product.id)) : [...products];
}

/** Filters picked in the sheet (search and the category chips are counted apart). */
export function findFilterCount(filters: FindFilters) {
  return (filters.way ? 1 : 0) + (filters.price ? 1 : 0) + (filters.city ? 1 : 0) + (filters.verified ? 1 : 0) + (filters.near ? 1 : 0) + (filters.notInShop ? 1 : 0);
}

/** Suppliers' cities for the Location filter, most products first. */
export function findCities(products: ReadonlyArray<{ supplier: { city: string } }>, max = 8) {
  const counts = new Map<string, number>();
  for (const product of products) {
    const city = product.supplier.city.trim();
    if (city) counts.set(city, (counts.get(city) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, max).map(([city]) => city);
}
