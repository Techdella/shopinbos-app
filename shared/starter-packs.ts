// Starter packs: ready-made bundles of supplier products for a new shop ("Ankara starter – 25 products", "Phone
// accessories – 30", "Hair & beauty – 20"). Worked out on the server from the products the seller can see (near
// them, so the supplier delivers in their state), never hand-picked: top-rated, in stock, from verified suppliers,
// not already in the shop. Pure, unit-tested in tests/find-quick-add.test.mjs; used by
// src/lib/marketplace/quick-add.server.ts.

import { DEFAULT_MARKUP, quickAddPrice, type Markup } from "./supplier-markup.ts";

export interface StarterPackDef {
  id: string;
  /** English name; the apps show the i18n key `pack.<id>`. */
  title: string;
  /** How many products a full pack has. */
  size: number;
  /** Words in the product's name or category that put it in the pack (descriptions are too noisy: "delivered to your home"). */
  match: RegExp;
  /** Words that keep a product out even when `match` finds one ("phone" in "phone pouch bag" is fashion). */
  not?: RegExp;
  /** The icon the apps show. */
  icon: "tag" | "phone" | "sparkle" | "home" | "star";
}

export const STARTER_PACKS: readonly StarterPackDef[] = [
  { id: "ankara", title: "Ankara starter", size: 25, icon: "tag", match: /ankara|adire|aso[\s-]?oke|kampala|kaftan|dashiki|agbada|gele|wax print|fabric|textile/i },
  { id: "phone-accessories", title: "Phone accessories", size: 30, icon: "phone", match: /phone|charger|charging|cable|earbud|earphone|headphone|power ?bank|screen (guard|protector)|airpod|bluetooth|usb|gadget/i, not: /pouch|purse|handbag/i },
  { id: "hair-beauty", title: "Hair & beauty", size: 20, icon: "sparkle", match: /hair|wig|braid|weave|lash|lip|skin|serum|shea|soap|perfume|fragrance|nail|make-?up|beauty|cream/i, not: /ice cream/i },
  { id: "home-kitchen", title: "Home & kitchen", size: 20, icon: "home", match: /kitchen|cook|pot\b|pots|plate|cup|mug|blender|bedsheet|duvet|pillow|towel|curtain|storage|home/i },
  { id: "kids-baby", title: "Kids & baby", size: 20, icon: "star", match: /baby|kid|child|toddler|toy|diaper|nappy|feeding bottle/i },
];

/** A pack shows only with at least this many products (or its full size, when smaller). */
export const PACK_MIN_PRODUCTS = 5;

export interface PackCandidate {
  id: string;
  name: string;
  category?: string | null;
  description?: string | null;
  supplierId: string;
  /** Pieces the supplier has; 0 or less is out of stock. */
  stock: number;
  verified: boolean;
  /** The supplier's rating out of 5 and how many shops rated them. */
  rating: number | null;
  ratingCount: number;
  trendScore: number;
  /** Near the seller, so the supplier delivers in their state (Find shows only these for now). */
  inRange: boolean;
  /** Already in the seller's shop. */
  inShop: boolean;
  dropship: boolean;
  /** Dropship from this supplier is agreed, so it adds straight away. */
  agreed: boolean;
  /** What the seller pays per piece, the supplier's suggested and lowest retail price. */
  cost: number;
  suggested?: number | null;
  minRetail?: number | null;
}

export function packMatches(def: StarterPackDef, product: Pick<PackCandidate, "name" | "category">) {
  const text = [product.name, product.category].filter(Boolean).join(" ");
  return def.match.test(text) && !(def.not && def.not.test(text));
}

/** Rating with three imaginary 4★ reviews, so one 5★ review doesn't beat thirty 4.8★ ones; unrated is 3.6. */
export function steadyRating(rating: number | null, count: number) {
  if (!(count > 0) || rating == null) return 3.6;
  return (rating * count + 4 * 3) / (count + 3);
}

/** Higher is better: rating first, then what's selling, then products that add straight away. */
export function packScore(product: PackCandidate) {
  return steadyRating(product.rating, product.ratingCount) * 10 + Math.min(Math.max(product.trendScore, 0), 100) / 10 + (!product.dropship || product.agreed ? 3 : 0);
}

/** Whether a product may go in any pack at all. */
export const packEligible = (product: PackCandidate) => product.inRange && product.verified && product.stock > 0 && !product.inShop;

/** The pack's products, best first, at most `def.size`. */
export function pickStarterPack(def: StarterPackDef, products: readonly PackCandidate[]): PackCandidate[] {
  return products
    .filter((product) => packEligible(product) && packMatches(def, product))
    .sort((a, b) => packScore(b) - packScore(a) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id))
    .slice(0, def.size);
}

export interface PackItem extends PackCandidate {
  /** The price it would be listed at with the seller's markup. */
  price: number;
  /** Adds straight away (wholesale from a verified supplier, or dropship already agreed). */
  ready: boolean;
}

export interface StarterPack {
  id: string;
  title: string;
  icon: StarterPackDef["icon"];
  size: number;
  count: number;
  items: PackItem[];
  /** What the seller pays the suppliers for one of each, and what one of each sells for. */
  totalCost: number;
  totalPrice: number;
  readyCount: number;
  /** Suppliers whose Dropship agreement comes first: their names are added by the server. */
  needsAgreement: string[];
}

/** Every pack with enough products for this seller, fullest first. */
export function starterPacks(products: readonly PackCandidate[], markup: Markup = DEFAULT_MARKUP, defs: readonly StarterPackDef[] = STARTER_PACKS): StarterPack[] {
  return defs
    .map((def) => {
      const items = pickStarterPack(def, products).map((product): PackItem => ({
        ...product,
        price: quickAddPrice({ cost: product.cost, suggested: product.suggested, minRetail: product.minRetail, markup }).price,
        ready: !product.dropship || product.agreed,
      }));
      return {
        id: def.id,
        title: def.title,
        icon: def.icon,
        size: def.size,
        count: items.length,
        items,
        totalCost: items.reduce((sum, item) => sum + item.cost, 0),
        totalPrice: items.reduce((sum, item) => sum + item.price, 0),
        readyCount: items.filter((item) => item.ready).length,
        needsAgreement: [...new Set(items.filter((item) => !item.ready).map((item) => item.supplierId))],
      };
    })
    .filter((pack) => pack.count >= Math.min(PACK_MIN_PRODUCTS, pack.size))
    .sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}
