// "Find products to sell" (seller app, /marketplace): the product cards, the money on each sale, Peggy's
// suggestion, the sample catalogue shown while the live marketplace is empty, and China imports through the
// sourcing partner. Pure (no server imports), unit-tested in tests/find-products.test.mjs.

import { unsplashUrl } from "../store-templates/demo-photos.ts";
import { preorderState, type PreorderState } from "../../../shared/preorder.ts";
import { dropshipOptionWords, dropshipUnitPrice, retailFloor } from "../../../shared/dropship-rules.ts";
import type { DropshipTerms } from "../../../shared/dropship-checkout.ts";

export interface FindPricingTier {
  minQty: number;
  maxQty?: number;
  price: number;
}

export interface FindSupplier {
  /** Supplier row id (null for samples). */
  id: string | null;
  /** The supplier's user id, for "Message supplier" (null for samples). */
  userId: string | null;
  slug: string | null;
  name: string;
  city: string;
  rating: number | null;
  /** Share of orders delivered on time, when we know it. */
  onTimePct: number | null;
  verified: boolean;
  /** What the supplier takes back (their own words), or null: the minimum in the Supplier terms applies. */
  returnPolicy?: string | null;
  /** verified | pending | unverified (shown as "Verified" / "Not verified yet"). */
  verificationStatus?: string;
  /** Shopinbos's risk score for this supplier (shared/supplier-trust.ts), when worked out. */
  risk?: { score: number; level: "low" | "medium" | "high"; reasons: string[] } | null;
  /** How far from the seller, and the supplier's area. */
  km?: number | null;
  area?: string | null;
  /** The seller and this supplier both accepted the Dropship agreement, so its products can be listed. */
  agreed?: boolean;
}

export interface FindProduct {
  id: string;
  /** Sample products show how the marketplace works; they can't be added to a store. */
  sample: boolean;
  name: string;
  description: string;
  /** Short category label for the chips: "Shoes", "Fashion", "Home"… */
  category: string;
  images: string[];
  supplier: FindSupplier;
  /** What the supplier charges per unit to dropship it (its dropship price when it sets one per channel). */
  cost: number;
  /** The supplier's base price per unit for wholesale (the start of its quantity breaks). Missing: `cost`. */
  wholesaleCost?: number;
  /** The lowest price a seller may list it at (the supplier's lowest retail price, never below `cost`). */
  floor?: number;
  /** "Ships 1 piece" · "Minimum 3 pieces" · "Packs in 1 day" (shared/dropship-rules.ts dropshipOptionWords). */
  dropshipOptions?: string[];
  /**
   * The full dropship terms for the product page (delivery to the seller's state, who pays, branding), worked out on
   * the server (src/lib/marketplace/dropship-listing.server.ts). Missing on cards and samples.
   */
  terms?: DropshipTerms | null;
  /** Suggested selling price. */
  price: number;
  /** "Ships in 24 hours", "Same day in Lagos", or "" when the supplier hasn't said. */
  ships: string;
  stock: number;
  moq: number;
  tiers: FindPricingTier[];
  dropship: boolean;
  wholesale: boolean;
  /** What similar items sell for, when there's something to compare with. */
  similar: [number, number] | null;
  trendScore: number;
  /** Boosted by the supplier this week (src/lib/plans/extras.server.ts): shown first, with a label. */
  featured?: boolean;
  /** The supplier takes preorders for stock (shared/preorder.ts); null when not. `depositPct`: the share paid when
   * the preorder is placed (0: the whole order is paid once the supplier accepts it). */
  preorder?: (PreorderState & { depositPct?: number }) | null;
}

// ─── Money ────────────────────────────────────────────────────────────────────

export function naira(amount: number) {
  return `₦${Math.round(amount).toLocaleString("en-NG")}`;
}

/**
 * Card payment fee on a sale (Paystack, local cards): 1.5% plus ₦100, the ₦100 waived under ₦2,500,
 * capped at ₦2,000.
 */
export function paymentFee(amount: number) {
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  const fee = amount * 0.015 + (amount >= 2500 ? 100 : 0);
  return Math.round(Math.min(fee, 2000));
}

export interface SaleBreakdown {
  shopperPays: number;
  supplierGets: number;
  fee: number;
  keep: number;
  /** Whole-number share of the selling price the seller keeps. */
  keepPct: number;
}

/** What happens to one sale at `price` of a product the supplier sells for `cost`. Delivery is added on top. */
export function saleBreakdown(price: number, cost: number): SaleBreakdown {
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
export function tierPrice(tiers: FindPricingTier[], quantity: number, base: number) {
  const match = [...tiers]
    .sort((a, b) => b.minQty - a.minQty)
    .find((tier) => quantity >= tier.minQty && (tier.maxQty === undefined || quantity <= tier.maxQty));
  return match?.price ?? base;
}

// ─── Labels ───────────────────────────────────────────────────────────────────

/** "24 hours" → "Ships in 24 hours"; "Same day in Lagos" stays as it is. */
export function shipsLabel(processingTime: string | null | undefined) {
  const text = (processingTime ?? "").trim().replace(/\s+/g, " ");
  if (!text) return "";
  if (/^(ships|same day|next day|ready)/i.test(text)) return text.charAt(0).toUpperCase() + text.slice(1);
  return `Ships in ${text}`;
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

export function supplierInitials(name: string) {
  const words = name.replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter(Boolean);
  return ((words[0]?.[0] ?? "") + (words[1]?.[0] ?? words[0]?.[1] ?? "")).toUpperCase() || "S";
}

/** "Aba Leatherworks · Aba · Ships in 24 hours" */
export function supplierLine(product: Pick<FindProduct, "supplier" | "ships">) {
  return [product.supplier.name, product.supplier.city, product.ships].filter(Boolean).join(" · ");
}

// ─── Live marketplace rows → cards ────────────────────────────────────────────

export interface SupplierProductRow {
  id: string;
  name: string;
  description: string;
  images: string[];
  wholesalePrice: number;
  suggestedRetailPrice: number;
  moq: number;
  stockQuantity: number;
  pricingTiers: unknown;
  dropshipAvailable: boolean;
  bulkOrderAvailable: boolean;
  processingTime: string | null;
  trendScore: number;
  preorderEnabled?: boolean;
  preorderShipsAt?: Date | null;
  preorderLimit?: number | null;
  preorderTaken?: number;
  preorderNote?: string | null;
  preorderDepositPct?: number;
  /** Prices per channel and dropship options (shared/dropship-rules.ts). */
  priceMode?: string | null;
  dropshipPrice?: number | null;
  minRetailPrice?: number | null;
  dropshipMinQty?: number | null;
  handlingDays?: number | null;
  sampleAvailable?: boolean | null;
  category: { name: string } | null;
  supplier: { id: string; userId: string; slug: string; displayName: string; city: string; rating: number; ratingCount: number; verificationStatus: string; returnPolicy?: string | null; address?: string | null };
}

export function parsePricingTiers(value: unknown): FindPricingTier[] {
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

export function toFindProduct(row: SupplierProductRow): FindProduct {
  return {
    id: row.id,
    sample: false,
    name: row.name,
    description: row.description,
    category: shortCategory(row.category?.name),
    images: row.images.filter(Boolean),
    supplier: {
      id: row.supplier.id,
      userId: row.supplier.userId,
      slug: row.supplier.slug,
      name: row.supplier.displayName,
      city: row.supplier.city,
      rating: row.supplier.ratingCount > 0 ? row.supplier.rating : null,
      onTimePct: null,
      verified: row.supplier.verificationStatus === "verified",
      verificationStatus: row.supplier.verificationStatus,
      returnPolicy: row.supplier.returnPolicy?.trim() || null,
    },
    // Dropship: the dropship price, and a suggested price never below the supplier's lowest allowed one.
    cost: row.dropshipAvailable ? dropshipUnitPrice(row) : row.wholesalePrice,
    wholesaleCost: row.wholesalePrice,
    price: row.dropshipAvailable ? Math.max(row.suggestedRetailPrice, retailFloor(row)) : row.suggestedRetailPrice,
    ...(row.dropshipAvailable ? { floor: retailFloor(row), dropshipOptions: dropshipOptionWords(row) } : {}),
    ships: shipsLabel(row.processingTime),
    stock: row.stockQuantity,
    moq: Math.max(1, row.moq),
    tiers: parsePricingTiers(row.pricingTiers),
    dropship: row.dropshipAvailable,
    wholesale: row.bulkOrderAvailable,
    similar: null,
    trendScore: row.trendScore,
    preorder: row.preorderEnabled ? { ...preorderState({ enabled: true, shipsAt: row.preorderShipsAt, limit: row.preorderLimit, taken: row.preorderTaken, note: row.preorderNote }), depositPct: row.preorderDepositPct ?? 0 } : null,
  };
}

/** What other listings in the same category suggest selling for (needs at least two to compare). */
export function similarRange(product: FindProduct, all: FindProduct[]): [number, number] | null {
  const peers = all.filter((other) => other.id !== product.id && other.category === product.category).map((other) => other.price);
  if (peers.length < 2) return null;
  return [Math.min(...peers), Math.max(...peers)];
}

export function categoriesOf(products: FindProduct[]) {
  const order = ["Shoes", "Fashion", "Home", "Gadgets", "Food", "Beauty"];
  const names = [...new Set(products.map((product) => product.category))];
  return names.sort((a, b) => {
    const ia = order.indexOf(a);
    const ib = order.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib) || a.localeCompare(b);
  });
}

export function filterFindProducts(products: FindProduct[], filters: { q?: string | null; category?: string | null }) {
  const q = (filters.q ?? "").trim().toLowerCase();
  const category = (filters.category ?? "").trim().toLowerCase();
  const words = q.split(/[\s,]+/).filter((word) => word.length > 1);
  return products.filter((product) => {
    if (category && product.category.toLowerCase() !== category) return false;
    if (!words.length) return true;
    const haystack = [product.name, product.description, product.category, product.supplier.name, product.supplier.city].join(" ").toLowerCase();
    // "shoes, bags, beauty" finds any of them; "leather slides" needs both words.
    const commaParts = q.split(",").map((part) => part.trim()).filter(Boolean);
    if (commaParts.length > 1) return commaParts.some((part) => part.split(/\s+/).every((word) => haystack.includes(singular(word))));
    return words.every((word) => haystack.includes(singular(word)));
  });
}

function singular(word: string) {
  return word.length > 3 && word.endsWith("s") && !word.endsWith("ss") ? word.slice(0, -1) : word;
}

// ─── Peggy's suggestion ───────────────────────────────────────────────────────

const SUGGESTIONS: Array<{ when: RegExp; category: string; why: string }> = [
  { when: /shoe|footwear|sneaker|slide|sandal|heel/i, category: "Fashion", why: "Outfits are an easy second item for people who come for shoes." },
  { when: /fashion|cloth|dress|wear|boutique|apparel|bag|ankara|tailor|fabric|style/i, category: "Shoes", why: "Shoes are the easiest add-on for fashion buyers." },
  { when: /home|decor|furniture|living|interior/i, category: "Home", why: "Small furniture and decor sit well next to what you already sell." },
  { when: /gadget|phone|electronic|tech|computer|accessor/i, category: "Gadgets", why: "Earbuds and small gadgets sell quickly and ship light." },
  { when: /food|snack|drink|bak|grocer|chop|kitchen/i, category: "Food", why: "Packaged snacks keep well and people reorder them." },
  { when: /beauty|skin|hair|cosmetic|makeup|wig/i, category: "Beauty", why: "Beauty buyers come back for more of what works." },
];

export interface PeggyInsight {
  /** Category to pre-select when the seller taps the suggestion (null for the generic line). */
  category: string | null;
  lead: string;
  body: string;
}

/** Peggy's line above the products, from what the store sells and who buys from it. */
export function peggyInsight(input: { storeCategory?: string | null; customers?: string | null; categories: string[] }): PeggyInsight {
  const tail = "These ship from Nigerian makers straight to your buyer, packed with your label.";
  const storeCategory = (input.storeCategory ?? "").trim();
  const rule = storeCategory ? SUGGESTIONS.find((entry) => entry.when.test(storeCategory)) : undefined;
  const category = rule && input.categories.includes(rule.category) ? rule.category : null;
  if (!rule || !category) {
    return { category: null, lead: "Start with one product you can test this week.", body: `You pay nothing until a shopper pays you. ${tail}` };
  }
  const customers = (input.customers ?? "").trim().replace(/[.\s]+$/, "");
  const forWho = customers && customers.length <= 80 ? ` Chosen for your buyers: ${customers.charAt(0).toLowerCase()}${customers.slice(1)}.` : "";
  return { category, lead: `${category} would suit your store.`, body: `${rule.why}${forWho} ${tail}` };
}

// ─── Sample catalogue (while suppliers join) ─────────────────────────────────

export const SAMPLE_PREFIX = "sample-";

export function isSampleId(id: string) {
  return id.startsWith(SAMPLE_PREFIX);
}

function photo(id: string) {
  return unsplashUrl(id, 800, 800);
}

type SampleSupplier = Omit<FindSupplier, "id" | "userId" | "slug" | "verified">;

const ABA: SampleSupplier = { name: "Aba Leatherworks", city: "Aba", rating: 4.8, onTimePct: 98 };
const KANO: SampleSupplier = { name: "Kano Footwear Co.", city: "Kano", rating: 4.6, onTimePct: 96 };
const OJA: SampleSupplier = { name: "Ọja Crafts", city: "Ibadan", rating: 4.7, onTimePct: 97 };
const TOLA: SampleSupplier = { name: "Mama Tola Textiles", city: "Yaba, Lagos", rating: 4.9, onTimePct: 99 };
const CANE: SampleSupplier = { name: "Ikorodu Cane Works", city: "Ikorodu, Lagos", rating: 4.7, onTimePct: 95 };
const CVH: SampleSupplier = { name: "Computer Village Hub", city: "Ikeja, Lagos", rating: 4.5, onTimePct: 97 };
const KWARA: SampleSupplier = { name: "Kwara Agro Foods", city: "Ilorin", rating: 4.8, onTimePct: 98 };

function sample(
  slug: string,
  name: string,
  category: string,
  supplier: SampleSupplier,
  money: { cost: number; price: number; similar: [number, number] },
  details: { ships: string; stock: number; moq: number; tiers: FindPricingTier[]; photos: string[]; description: string },
): FindProduct {
  return {
    id: `${SAMPLE_PREFIX}${slug}`,
    sample: true,
    name,
    description: details.description,
    category,
    images: details.photos.map(photo),
    supplier: { ...supplier, id: null, userId: null, slug: null, verified: true },
    cost: money.cost,
    price: money.price,
    ships: details.ships,
    stock: details.stock,
    moq: details.moq,
    tiers: details.tiers,
    dropship: true,
    wholesale: true,
    similar: money.similar,
    trendScore: 0,
  };
}

/**
 * Shown, clearly labelled, while no verified supplier has listed anything. Photos are Unsplash ids checked by
 * eye against each product (several are shared with the theme previews in store-templates/demo-photos.ts).
 */
export const SAMPLE_PRODUCTS: FindProduct[] = [
  sample("leather-slides", "Leather slides", "Shoes", ABA, { cost: 6000, price: 13000, similar: [11500, 15000] }, {
    ships: "Ships in 24 hours", stock: 140, moq: 10,
    tiers: [{ minQty: 10, maxQty: 49, price: 5400 }, { minQty: 50, price: 4900 }],
    photos: ["1585120824848-8a5cd41493d2", "1613662632164-7f2b081a5b46"],
    description: "Hand-stitched leather slides from Aba with a cushioned footbed. Sizes 37 to 45.",
  }),
  sample("leather-lace-ups", "Leather lace-ups", "Shoes", ABA, { cost: 9500, price: 21000, similar: [18000, 24000] }, {
    ships: "Ships in 24 hours", stock: 60, moq: 6,
    tiers: [{ minQty: 6, maxQty: 29, price: 8800 }, { minQty: 30, price: 8200 }],
    photos: ["1611937669166-be4e0503b115"],
    description: "Brown leather lace-ups for work and weddings, made in Aba. Sizes 40 to 46.",
  }),
  sample("court-sneakers", "Court sneakers", "Shoes", KANO, { cost: 11000, price: 24000, similar: [20000, 28000] }, {
    ships: "Ships in 48 hours", stock: 85, moq: 6,
    tiers: [{ minQty: 6, maxQty: 23, price: 10200 }, { minQty: 24, price: 9600 }],
    photos: ["1780824947013-dc7e01284025"],
    description: "Clean white leather court sneakers that go with everything. Sizes 38 to 45.",
  }),
  sample("nude-heels", "Nude heels", "Shoes", OJA, { cost: 8800, price: 19500, similar: [16000, 22000] }, {
    ships: "Ships in 24 hours", stock: 48, moq: 6,
    tiers: [{ minQty: 6, maxQty: 23, price: 8100 }, { minQty: 24, price: 7600 }],
    photos: ["1459712105412-be146fae746d"],
    description: "Nude pointed heels for owambe and the office. Sizes 36 to 42.",
  }),
  sample("linen-two-piece-set", "Linen two-piece set", "Fashion", TOLA, { cost: 12500, price: 29500, similar: [25000, 34000] }, {
    ships: "Same day in Lagos", stock: 70, moq: 5,
    tiers: [{ minQty: 5, maxQty: 19, price: 11500 }, { minQty: 20, price: 10800 }],
    photos: ["1783113298894-eeb3b71315d9"],
    description: "Relaxed linen shirt and trousers, cut and sewn in Yaba. Sizes S to XXL.",
  }),
  sample("navy-wool-blazer", "Navy wool blazer", "Fashion", TOLA, { cost: 15000, price: 34000, similar: [30000, 40000] }, {
    ships: "Same day in Lagos", stock: 40, moq: 5,
    tiers: [{ minQty: 5, maxQty: 19, price: 14000 }, { minQty: 20, price: 13200 }],
    photos: ["1507679799987-c73779587ccf", "1617137968427-85924c800a22"],
    description: "A sharp single-breasted blazer in navy wool blend. Sizes 46 to 56.",
  }),
  sample("rattan-armchair", "Rattan armchair", "Home", CANE, { cost: 48000, price: 85000, similar: [75000, 98000] }, {
    ships: "Ships in 3 days", stock: 12, moq: 2,
    tiers: [{ minQty: 2, maxQty: 9, price: 45000 }, { minQty: 10, price: 42000 }],
    photos: ["1617325721270-06dce2689456"],
    description: "Woven rattan armchair on a hardwood frame, made by hand in Ikorodu.",
  }),
  sample("low-wooden-stool", "Low wooden stool", "Home", CANE, { cost: 12000, price: 24000, similar: [18000, 28000] }, {
    ships: "Ships in 3 days", stock: 30, moq: 4,
    tiers: [{ minQty: 4, maxQty: 19, price: 11000 }, { minQty: 20, price: 10200 }],
    photos: ["1503602642458-232111445657"],
    description: "A simple wooden stool for the kitchen, bedside or shop counter.",
  }),
  sample("wireless-earbuds", "Wireless earbuds", "Gadgets", CVH, { cost: 9000, price: 17500, similar: [15000, 22000] }, {
    ships: "Same day in Lagos", stock: 200, moq: 10,
    tiers: [{ minQty: 10, maxQty: 49, price: 8300 }, { minQty: 50, price: 7700 }],
    photos: ["1572569511254-d8f925fe2cbb", "1590658268037-6bf12165a8df"],
    description: "Bluetooth earbuds with a charging case, tested before they leave Computer Village.",
  }),
  sample("chin-chin-jar", "Chin chin, 1kg jar", "Food", KWARA, { cost: 2400, price: 4500, similar: [3500, 5500] }, {
    ships: "Ships in 48 hours", stock: 300, moq: 12,
    tiers: [{ minQty: 12, maxQty: 47, price: 2200 }, { minQty: 48, price: 2000 }],
    photos: ["1665554837563-3782d21a676b"],
    description: "Crunchy, lightly sweet chin chin in a resealable 1kg jar. A favourite in December gift boxes.",
  }),
];

export function findSample(id: string) {
  return SAMPLE_PRODUCTS.find((product) => product.id === id) ?? null;
}

// ─── Trending ─────────────────────────────────────────────────────────────────

export interface TrendIdea {
  title: string;
  reason: string;
  image: string;
  /** Search the Nigeria tab with this. */
  query: string;
}

/** Seasonal ideas while there's no live trend data to show. */
export const TREND_IDEAS: TrendIdea[] = [
  { title: "Two-piece linen sets", reason: "Light sets sell well as the dry season starts", image: unsplashUrl("1783113298894-eeb3b71315d9", 900, 520), query: "two-piece" },
  { title: "Leather slides", reason: "An easy add-on for fashion stores", image: unsplashUrl("1613662632164-7f2b081a5b46", 900, 520), query: "slides" },
  { title: "December gift boxes", reason: "Start selling in late October", image: unsplashUrl("1513885535751-8b9238bd345a", 900, 520), query: "gift" },
];

/** Live trends: the top categories by trend score, each with its best product's photo. */
export function trendsFromProducts(products: FindProduct[], limit = 6): TrendIdea[] {
  const byCategory = new Map<string, FindProduct[]>();
  for (const product of products) {
    if (product.trendScore <= 0) continue;
    byCategory.set(product.category, [...(byCategory.get(product.category) ?? []), product]);
  }
  return [...byCategory.entries()]
    .map(([category, items]) => ({ category, items: items.sort((a, b) => b.trendScore - a.trendScore) }))
    .sort((a, b) => b.items[0].trendScore - a.items[0].trendScore)
    .slice(0, limit)
    .map(({ category, items }) => {
      const top = items[0];
      const best = Math.max(...items.map((item) => saleBreakdown(item.price, item.cost).keepPct));
      return {
        title: top.name,
        reason: `${items.length} trending in ${category} · keep up to ${best}%`,
        image: top.images[0] ?? "",
        query: top.name,
      };
    });
}

// ─── China imports (the request form and My imports: src/lib/imports) ────────

export const IMPORT_HOW_IT_WORKS = [
  "Our sourcing partner in Guangzhou buys it in yuan. You pay in naira.",
  "They check every item and send QC photos before it ships.",
  "Air takes 10 to 14 days, sea 6 to 8 weeks. Customs is included.",
  "It lands in your stock, priced and listed by Rex.",
];

export const IMPORT_EXAMPLES = ["Women's linen two-piece set", "Bluetooth earbuds with case", "Mini bucket bag"];

// ─── Seller's sourcing data (Store.brandSettings.sourcing, private) ──────────

export interface SourcingSettings {
  /** Supplier product ids the seller saved. */
  saved: string[];
  /** "Get notified" when real suppliers list products. */
  notifyNewSuppliers: boolean;
}

export function parseSourcing(value: unknown): SourcingSettings {
  const raw = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  return {
    saved: Array.isArray(raw.saved) ? [...new Set(raw.saved.filter((id): id is string => typeof id === "string" && id.length <= 64))].slice(0, 500) : [],
    notifyNewSuppliers: raw.notifyNewSuppliers === true,
  };
}
