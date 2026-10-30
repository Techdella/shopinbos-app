// One-tap and bulk "Add to my shop" for supplier products, without the database: which products go in, at what
// price, and why the others don't. src/lib/marketplace/quick-add.server.ts wires it to Prisma (an advisory lock per
// store, so two taps or two phones never make the same product twice); tests/find-quick-add.test.mjs drives it with
// an in-memory store. No "@/" imports so node --test can load it.
//
// For each supplier product, in the order sent (duplicates dropped):
//   already in the shop          → `already` (an archived one comes back as a draft at the new price: `added`)
//   gone / hidden supplier       → NOT_AVAILABLE
//   out of stock                 → OUT_OF_STOCK (a listing taking preorders still adds)
//   wholesale, unverified        → NOT_VERIFIED (buy stock only from verified suppliers)
//   dropship, no agreement yet   → the agreement's own code (AGREEMENT_NEEDED, AGREEMENT_WAITING …; TOO_FAR is no longer sent)
//   price below the supplier's lowest or at a loss, even raised a few steps → PRICE_PROBLEM
//   over the plan's products (or dropship products) → PLAN_LIMIT, for this one and every later one
// The price: the supplier's suggested retail price, else cost + the seller's markup, rounded to a nice price and
// never below the lowest allowed (shared/supplier-markup.ts quickAddPrice).

import { listingProblem, cleanListingChoice, type DropshipTerms } from "../../../shared/dropship-checkout.ts";
import { DEFAULT_MARKUP, nicePrice, niceStep, quickAddPrice, type Markup, type QuickPriceBasis } from "../../../shared/supplier-markup.ts";

/** Most products one request adds (the phone sends a big selection in batches of this). */
export const QUICK_ADD_MAX = 60;
/** How many nice-price steps a dropship price may be raised to clear the supplier's lowest price or a loss. */
const RAISE_STEPS = 6;

export type QuickSkipCode =
  | "NOT_AVAILABLE"
  | "OUT_OF_STOCK"
  | "NOT_VERIFIED"
  | "PRICE_PROBLEM"
  | "PLAN_LIMIT"
  | "AGREEMENT_NEEDED"
  | "AGREEMENT_WAITING"
  | "AGREEMENT_DECLINED"
  | "TOO_FAR"
  | "NO_PLACE"
  | "PAUSED"
  | "NOT_PAYABLE";

export interface QuickProduct {
  id: string;
  name: string;
  supplierId: string;
  supplierName: string;
  /** The supplier is verified (wholesale needs it). */
  verified: boolean;
  dropship: boolean;
  stock: number;
  /** The supplier takes preorders on it and has places left. */
  preorderOpen: boolean;
  /** The supplier's base price per piece (wholesale). */
  wholesalePrice: number;
  suggested: number;
  minRetail: number | null;
}

export type Gate = { ok: true } | { ok: false; code: string; message: string };

export interface PlanRoom {
  /** null: no limit. */
  products: number | null;
  dropship: number | null;
  have: number;
  haveDropship: number;
}

export interface NewListing {
  product: QuickProduct;
  retailPrice: number;
  costPrice: number;
  dropship: boolean;
  deliveryPayer: string | null;
  deliveryFlatFee: number | null;
}

export interface QuickAddDeps {
  /** The live products among these ids (published, from a supplier sellers can see). */
  products(ids: string[]): Promise<QuickProduct[]>;
  /** Store products already linked to these supplier products. */
  existing(ids: string[]): Promise<Array<{ supplierProductId: string; storeProductId: string; archived: boolean }>>;
  /** Whether this seller may list this supplier's products to dropship (src/lib/marketplace/agreements.server.ts). */
  gate(supplierId: string): Promise<Gate>;
  /** Dropship terms of these products for this seller. */
  terms(products: QuickProduct[]): Promise<Map<string, DropshipTerms>>;
  room(): Promise<PlanRoom>;
  /** Makes the store product unless one already links to it (checked again under the store's lock). */
  create(listing: NewListing): Promise<{ storeProductId: string; already: boolean }>;
  /** Brings an archived one back as a draft at this price. */
  restore(storeProductId: string, listing: NewListing): Promise<void>;
}

export interface QuickAdded {
  supplierProductId: string;
  storeProductId: string;
  name: string;
  retailPrice: number;
  basis: QuickPriceBasis;
}

export interface QuickSkipped {
  supplierProductId: string;
  name: string | null;
  code: QuickSkipCode;
  message: string;
  supplierId: string | null;
  supplierName: string | null;
}

export interface QuickAddResult {
  added: QuickAdded[];
  already: Array<{ supplierProductId: string; storeProductId: string; name: string | null }>;
  skipped: QuickSkipped[];
  /** The plan's room after this request: null when there's no limit. */
  left: number | null;
}

/** The ids in the order sent, each once, at most QUICK_ADD_MAX. */
export function cleanIds(ids: readonly unknown[]): string[] {
  const seen = new Set<string>();
  for (const id of ids) {
    if (typeof id !== "string" || !id || id.length > 64) continue;
    seen.add(id);
    if (seen.size >= QUICK_ADD_MAX) break;
  }
  return [...seen];
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? "" : "s"}`;

/** The plan line, calm, with no upgrade line in it: the phone shows it as it is, the web adds a link to plans. */
export function planLimitMessage(room: PlanRoom, dropship: boolean) {
  if (dropship && room.dropship !== null && room.haveDropship >= room.dropship) return `Your plan includes up to ${plural(room.dropship, "dropship product")} and you have ${room.haveDropship}.`;
  return `Your plan includes up to ${plural(room.products ?? 0, "product")} and you have ${room.have}.`;
}

/**
 * The listing price for a dropship product: the one-tap price, raised a few nice steps if the supplier's lowest price
 * or a loss on the card fee refuses it; null when it still can't be listed.
 */
export function dropshipQuickPrice(terms: DropshipTerms, suggested: number, markup: Markup): { price: number; basis: QuickPriceBasis } | null {
  const first = quickAddPrice({ cost: terms.cost, suggested: Math.max(suggested, 0), minRetail: terms.floor, markup });
  let price = first.price;
  for (let step = 0; step <= RAISE_STEPS; step += 1) {
    if (!listingProblem(terms, { retailPrice: price, payer: "customer" })) return { price, basis: step === 0 ? first.basis : "lowest" };
    price = nicePrice(price + niceStep(price));
  }
  return null;
}

export async function runQuickAdd(deps: QuickAddDeps, input: { ids: readonly unknown[]; markup?: Markup | null }): Promise<QuickAddResult> {
  const ids = cleanIds(input.ids);
  const markup = input.markup ?? DEFAULT_MARKUP;
  const result: QuickAddResult = { added: [], already: [], skipped: [], left: null };
  if (!ids.length) return result;

  const [products, existing] = await Promise.all([deps.products(ids), deps.existing(ids)]);
  const byId = new Map(products.map((product) => [product.id, product]));
  const linked = new Map(existing.map((row) => [row.supplierProductId, row]));
  const live = (id: string) => Boolean(linked.get(id) && !linked.get(id)!.archived);
  const terms = await deps.terms(products.filter((product) => product.dropship && !live(product.id)));
  const gates = new Map<string, Promise<Gate>>();
  const gateFor = (supplierId: string) => {
    if (!gates.has(supplierId)) gates.set(supplierId, deps.gate(supplierId));
    return gates.get(supplierId)!;
  };
  const room = await deps.room();
  const skip = (id: string, product: QuickProduct | undefined, code: QuickSkipCode, message: string) =>
    result.skipped.push({ supplierProductId: id, name: product?.name ?? null, code, message, supplierId: product?.supplierId ?? null, supplierName: product?.supplierName ?? null });

  for (const id of ids) {
    const product = byId.get(id);
    const link = linked.get(id);
    if (link && live(id)) {
      result.already.push({ supplierProductId: id, storeProductId: link.storeProductId, name: product?.name ?? null });
      continue;
    }
    if (!product) {
      skip(id, undefined, "NOT_AVAILABLE", "This product isn't available any more.");
      continue;
    }
    if (product.stock <= 0 && !product.preorderOpen) {
      skip(id, product, "OUT_OF_STOCK", `${product.supplierName} is out of stock of this.`);
      continue;
    }
    if (!product.dropship && !product.verified) {
      skip(id, product, "NOT_VERIFIED", "Buy stock only from verified suppliers. This one isn't verified yet.");
      continue;
    }
    if (product.dropship) {
      const gate = await gateFor(product.supplierId);
      if (!gate.ok) {
        skip(id, product, gate.code as QuickSkipCode, gate.message);
        continue;
      }
    }

    let listing: NewListing;
    let basis: QuickPriceBasis;
    if (product.dropship) {
      const productTerms = terms.get(product.id);
      const priced = productTerms ? dropshipQuickPrice(productTerms, product.suggested, markup) : null;
      if (!productTerms || !priced) {
        skip(id, product, "PRICE_PROBLEM", "This can't be listed at a price that covers what you pay. Open it to set your price.");
        continue;
      }
      const clean = cleanListingChoice(productTerms, { retailPrice: priced.price, payer: "customer" });
      listing = { product, retailPrice: priced.price, costPrice: productTerms.cost, dropship: true, deliveryPayer: clean.payer, deliveryFlatFee: clean.flatFee };
      basis = priced.basis;
    } else {
      const priced = quickAddPrice({ cost: product.wholesalePrice, suggested: product.suggested, minRetail: product.minRetail, markup });
      listing = { product, retailPrice: priced.price, costPrice: product.wholesalePrice, dropship: false, deliveryPayer: null, deliveryFlatFee: null };
      basis = priced.basis;
    }

    // Plan room, counted as this request adds (an archived product coming back counts again too).
    if ((room.products !== null && room.have + 1 > room.products) || (product.dropship && room.dropship !== null && room.haveDropship + 1 > room.dropship)) {
      skip(id, product, "PLAN_LIMIT", planLimitMessage(room, product.dropship));
      continue;
    }

    if (link?.archived) {
      await deps.restore(link.storeProductId, listing);
      result.added.push({ supplierProductId: id, storeProductId: link.storeProductId, name: product.name, retailPrice: listing.retailPrice, basis });
    } else {
      const made = await deps.create(listing);
      if (made.already) {
        result.already.push({ supplierProductId: id, storeProductId: made.storeProductId, name: product.name });
        continue;
      }
      result.added.push({ supplierProductId: id, storeProductId: made.storeProductId, name: product.name, retailPrice: listing.retailPrice, basis });
    }
    room.have += 1;
    if (product.dropship) room.haveDropship += 1;
  }

  const left = [room.products === null ? null : room.products - room.have, room.dropship === null ? null : room.dropship - room.haveDropship].filter((value): value is number => value !== null);
  result.left = left.length ? Math.max(0, Math.min(...left)) : null;
  return result;
}

/** Skips grouped for the summary: "8 need a Dropship agreement with Ada Fabrics", "3 are out of stock". */
export function groupSkips(skipped: readonly QuickSkipped[]) {
  const groups = new Map<string, { code: QuickSkipCode; supplierId: string | null; supplierName: string | null; message: string; ids: string[]; names: string[] }>();
  for (const item of skipped) {
    const perSupplier = item.code.startsWith("AGREEMENT") || item.code === "TOO_FAR";
    const key = perSupplier ? `${item.code}:${item.supplierId}` : item.code;
    const group = groups.get(key) ?? { code: item.code, supplierId: perSupplier ? item.supplierId : null, supplierName: perSupplier ? item.supplierName : null, message: item.message, ids: [], names: [] };
    group.ids.push(item.supplierProductId);
    if (item.name) group.names.push(item.name);
    groups.set(key, group);
  }
  return [...groups.values()];
}
