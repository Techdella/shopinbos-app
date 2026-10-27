import "server-only";
import { db } from "@/lib/db/client";
import { lockedEmailError } from "@/lib/marketing/popup-rewards";
import { bestAutomaticDiscount, discountAmount, describeDiscount, parseDiscountConfig, redemptionError, type DiscountLine } from "@/lib/discounts";
import { contactsInSegment, segmentRules } from "@/lib/marketing/contacts";
import { readGameConfig } from "@/lib/gamification/logic";
import { quotePoints, type PointsRedemption } from "@/lib/gamification/loyalty.server";
import { preorderDay } from "@shared/preorder";
import { buildStockHolds, isDropshipProduct, stockShortfallDetails, stockShortfallMessage, storeStockMode, type StockHold, type VariantHold } from "@/lib/commerce/stock-holds";
import { normalizeVariants, resolveLineVariant } from "@shared/product-variants";
import { maybeExpireUnpaidOrders } from "@/lib/commerce/order-expiry.server";
import { spreadAgreedAmount } from "@/lib/payment-links/pure";
import { marketChoiceForStore } from "@/lib/delivery-market/market.server";
import { chooseMarketOption, type MarketOption } from "@shared/delivery-market";
import {
  chooseDelivery,
  deliveryOptionsFor,
  orderTotals,
  type CheckoutSettings,
  type DeliveryChoice,
  type DeliveryOption,
  type OrderTotals,
} from "@shared/cart-checkout";

// Prices an order from the database, never from what the browser says: product and variant prices, stock,
// the delivery option for the address, and the one discount that applies (a code the shopper typed, else the
// best automatic discount). Used by the checkout API to charge and by the quote API to show the same numbers.

export interface PricedItem {
  productId: string;
  name: string;
  price: number;
  quantity: number;
  /** The version's label, e.g. "L / Red" (the name then reads "Ankara dress · L / Red"). */
  variant?: string;
  /** The version's id in the product's variants. */
  variantId?: string;
  image?: string;
  /** A preorder line (shared/preorder.ts): ships from shipsOn (YYYY-MM-DD) or "soon". */
  preorder?: true;
  shipsOn?: string | null;
}

export interface AppliedDiscount {
  kind: "discount" | "coupon";
  id: string;
  code: string;
  type: string;
  amount: number;
  label: string;
  automatic: boolean;
}

export interface PricedOrder {
  ok: true;
  items: PricedItem[];
  /**
   * The delivery choice. With delivery partners at checkout (src/lib/delivery-market), `market` is set: the options
   * are the partners' (each carrying the parcels it books), and `reason` says why nothing covers the address.
   */
  delivery: { choice: DeliveryChoice; option: DeliveryOption | null; market: { option: MarketOption | null; reason: string | null; shipmentCount: number } | null };
  discount: AppliedDiscount | null;
  /** Why the typed code did not apply, in words for the shopper. */
  codeError: string | null;
  /** Loyalty points used on this order (already inside totals.productDiscount and totals.total). */
  points: PointsRedemption | null;
  totals: OrderTotals;
  /** The stock this order takes: the store's, or the supplier's for dropship products. Server-only, never sent to the browser. */
  stockHolds: StockHold[];
}

export interface PricingInput {
  /** userId and city: needed for delivery partners at checkout (without them, the store's own zones price delivery). */
  store: { id: string; brandSettings: unknown; userId?: string; city?: string | null };
  items: Array<{ productId: string; quantity: number; variant?: string | null; variantId?: string | null }>;
  address: { city?: string; state?: string };
  deliveryOptionId?: string | null;
  discountCode?: string | null;
  buyerEmail?: string | null;
  settings: Pick<CheckoutSettings, "enableCoupon">;
  /** Loyalty points the shopper wants to use; needs buyerEmail and the phone from an earlier order. */
  loyalty?: { points: number; phone?: string | null } | null;
  /**
   * A price the seller agreed for these items (before delivery), from a payment link loaded on the server, never
   * from the browser. The lines are re-priced to add up to it and no automatic discount is added on top.
   */
  agreedItemsTotal?: number | null;
  /**
   * A delivery fee the seller agreed on a payment link (0 = free), loaded on the server, never from the browser.
   * It replaces the store's zones and delivery partners: the seller delivers it to the link's saved address.
   */
  agreedDeliveryFee?: number | null;
}

/** The one delivery option of a payment link with an agreed fee. */
export const LINK_DELIVERY_OPTION_ID = "link_delivery";

/** Stock left per version id (null when that version isn't counted). */
function resolveStock(raw: unknown) {
  return new Map(normalizeVariants(raw).map((variant) => [variant.id, variant.stock] as const));
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** Once-per-customer and segment-only discounts, checked when we know who is buying. */
async function eligibilityError(storeId: string, discount: { code: string; config: unknown }, buyerEmail: string | null | undefined) {
  const config = parseDiscountConfig(discount.config);
  const email = buyerEmail?.trim().toLowerCase();
  // A sign-up form's one-person code only works with the email that signed up.
  const locked = lockedEmailError(discount.config, buyerEmail);
  if (locked) return locked;
  if (config.oncePerCustomer) {
    if (!email) return "Enter your email to use this code.";
    const used = await db.retailOrder.count({ where: { storeId, buyerEmail: { equals: email, mode: "insensitive" }, discountCode: discount.code, status: { notIn: ["cancelled"] } } });
    if (used > 0) return "You've already used this code.";
  }
  if (config.segmentId) {
    if (!email) return "Enter your email to use this code.";
    const rules = await segmentRules(storeId, config.segmentId);
    if (!rules) return "This code isn't available.";
    const members = await contactsInSegment(storeId, rules);
    if (!members.some((contact) => contact.email?.toLowerCase() === email)) return "This code isn't available for your account.";
  }
  return null;
}

export async function priceOrder(input: PricingInput): Promise<PricedOrder | { ok: false; message: string }> {
  const quantities = new Map<string, number>();
  for (const item of input.items) quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);

  // Unpaid orders past their time give their stock back first, so it counts as available below.
  await maybeExpireUnpaidOrders(input.store.id);

  const products = await db.storeProduct.findMany({
    where: { storeId: input.store.id, id: { in: [...quantities.keys()] }, status: "published" },
    select: {
      id: true, name: true, images: true, retailPrice: true, currentStock: true, variants: true,
      // The seller's "Track stock" switch: untracked products are never short and give no stock.
      trackStock: true, continueSellingWhenOut: true, reservedStock: true,
      // Preorders take no stock, only a place under the cap; their lines are tagged on the order.
      preorderEnabled: true, preorderLimit: true, preorderTaken: true, preorderShipsAt: true,
      // Dropship products sell from the supplier's stock (the seller holds none).
      fulfillmentType: true, supplierProductId: true, supplierProduct: { select: { id: true, stockQuantity: true, status: true } },
    },
  });
  if (products.length !== quantities.size) return { ok: false, message: "One or more items in your bag are no longer available. Remove them and try again." };

  // Each line's version (size / colour…) and price come from the product, never from the browser.
  const byId = new Map(products.map((product) => [product.id, product]));
  const merged = new Map<string, PricedItem>();
  const variantHolds = new Map<string, VariantHold[]>();
  for (const line of input.items) {
    const product = byId.get(line.productId)!;
    const choice = resolveLineVariant(product, { variantId: line.variantId, label: line.variant });
    if (!choice.ok) {
      return {
        ok: false,
        message: choice.reason === "choose"
          ? `Choose a size or option for ${product.name} on its page, then try again.`
          : `The option you picked for ${product.name} isn't available any more. Remove it from your bag and choose again.`,
      };
    }
    const variant = choice.variant;
    // Dropship products sell from the supplier's stock, so only the seller's own versions are counted here, and
    // only when the seller tracks this product's stock.
    const mode = storeStockMode(product);
    // Preorders take no stock at all, so their versions' counts aren't taken either.
    if (variant && variant.stock !== null && !isDropshipProduct(product) && storeStockMode(product) !== "off" && mode !== "preorder") {
      const list = variantHolds.get(product.id) ?? [];
      const held = list.find((entry) => entry.id === variant.id);
      if (held) held.quantity += line.quantity;
      else list.push({ id: variant.id, quantity: line.quantity, name: `${product.name} · ${variant.name}` });
      variantHolds.set(product.id, list);
    }
    const key = `${product.id}::${variant?.id ?? ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      continue;
    }
    const image = variant?.imageUrl ?? product.images[0];
    merged.set(key, {
      productId: product.id,
      name: variant ? `${product.name} · ${variant.name}` : product.name,
      price: choice.price,
      quantity: line.quantity,
      ...(variant ? { variant: variant.name, variantId: variant.id } : {}),
      ...(image ? { image } : {}),
      ...(mode === "preorder" && !isDropshipProduct(product) ? { preorder: true as const, shipsOn: preorderDay(product.preorderShipsAt) } : {}),
    });
  }

  // Tracked products can't sell more than is left (in stock minus set aside); dropship ones more than the supplier has.
  const short = stockShortfallDetails(products, quantities);
  // A size or colour counted on its own needs enough of that version too (unless the product keeps selling at 0).
  for (const [productId, holds] of variantHolds) {
    const product = byId.get(productId)!;
    if (storeStockMode(product) !== "strict") continue;
    const variants = resolveStock(product.variants);
    for (const hold of holds) {
      const left = variants.get(hold.id);
      if (left !== undefined && left !== null && left < hold.quantity && !short.some((entry) => entry.name === hold.name)) short.push({ name: hold.name, available: Math.max(0, left) });
    }
  }
  if (short.length) return { ok: false, message: stockShortfallMessage(short) };
  const stockHolds = buildStockHolds(products, quantities, variantHolds);

  const agreed = typeof input.agreedItemsTotal === "number" && input.agreedItemsTotal > 0 ? input.agreedItemsTotal : null;
  const items = agreed !== null ? spreadAgreedAmount([...merged.values()], agreed) : [...merged.values()];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const zones = await db.shippingZone.findMany({
    where: { storeId: input.store.id, active: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, regions: true, rates: true },
  });
  const flatRate = Number(record(record(input.store.brandSettings).shippingConfig).flatRate ?? 0) || 0;
  const agreedFee = typeof input.agreedDeliveryFee === "number" && Number.isFinite(input.agreedDeliveryFee) && input.agreedDeliveryFee >= 0 ? Math.round(input.agreedDeliveryFee * 100) / 100 : null;
  // Delivery partners at checkout (the seller switched it on): their options replace the store's own zones. A fee
  // the seller agreed on a payment link replaces both.
  const market = input.store.userId && agreedFee === null
    ? await marketChoiceForStore({ id: input.store.id, userId: input.store.userId, city: input.store.city ?? null }, items.map((item) => ({ productId: item.productId, quantity: item.quantity })), input.address)
    : null;
  let choice: DeliveryChoice;
  let option: DeliveryOption | null;
  let fee: number;
  let marketPick: { option: MarketOption | null; reason: string | null; shipmentCount: number } | null = null;
  if (agreedFee !== null) {
    option = { id: LINK_DELIVERY_OPTION_ID, name: "Doorstep delivery", price: agreedFee, estimatedDays: null, pickup: false };
    choice = { covered: true, options: [option] };
    fee = agreedFee;
  } else if (market) {
    const picked = chooseMarketOption(market.choice, input.deliveryOptionId);
    choice = { covered: market.choice.covered, options: market.choice.options };
    option = picked.option;
    fee = picked.fee;
    marketPick = { option: picked.option, reason: market.choice.reason, shipmentCount: market.choice.shipmentCount };
  } else {
    choice = deliveryOptionsFor(zones, flatRate, input.address, subtotal);
    ({ option, fee } = chooseDelivery(choice, input.deliveryOptionId));
  }

  const lines: DiscountLine[] = items.map((item) => ({ productId: item.productId, price: item.price, quantity: item.quantity }));
  let applied: AppliedDiscount | null = null;
  let codeError: string | null = null;
  const code = input.settings.enableCoupon ? input.discountCode?.trim().toUpperCase() : "";

  if (code) {
    const discount = await db.discount.findUnique({ where: { storeId_code: { storeId: input.store.id, code } } });
    if (discount) {
      codeError = redemptionError(discount, subtotal) ?? (await eligibilityError(input.store.id, discount, input.buyerEmail));
      if (!codeError) {
        applied = { kind: "discount", id: discount.id, code: discount.code, type: discount.type, amount: discountAmount(discount, lines, fee), label: describeDiscount(discount), automatic: false };
      }
    } else {
      const coupon = await db.coupon.findUnique({ where: { code } });
      if (coupon && coupon.storeId === input.store.id) {
        codeError = redemptionError(coupon, subtotal);
        if (!codeError) {
          applied = { kind: "coupon", id: coupon.id, code: coupon.code, type: coupon.type, amount: discountAmount(coupon, lines, fee), label: describeDiscount(coupon), automatic: false };
        }
      } else {
        codeError = "That code isn't valid for this store.";
      }
    }
    if (applied && applied.amount <= 0) {
      codeError = "This code doesn't apply to the items in your bag.";
      applied = null;
    }
  }

  if (!applied && agreed === null) {
    const candidates = await db.discount.findMany({ where: { storeId: input.store.id, status: "active" } });
    const best = bestAutomaticDiscount(candidates, lines, fee);
    if (best && !(await eligibilityError(input.store.id, best.discount, input.buyerEmail))) {
      applied = { kind: "discount", id: best.discount.id, code: best.discount.code, type: best.discount.type, amount: best.amount, label: `${best.discount.name}: ${describeDiscount(best.discount)}`, automatic: true };
    }
  }

  let totals = orderTotals({ subtotal, shippingFee: fee, discount: applied ? { type: applied.type, amount: applied.amount } : null });

  // Loyalty points come off the products after any code, capped by the store's settings (never below zero).
  let points: PointsRedemption | null = null;
  if (input.loyalty && input.loyalty.points > 0 && input.buyerEmail) {
    const loyalty = readGameConfig(record(record(input.store.brandSettings).gamification)).loyalty;
    const base = Math.max(0, totals.subtotal - totals.productDiscount);
    points = await quotePoints({ storeId: input.store.id, email: input.buyerEmail, phone: input.loyalty.phone, requested: input.loyalty.points, base, settings: loyalty }).catch((error) => {
      console.error("[pricing] points quote failed", error);
      return null;
    });
    if (points) {
      const amount = Math.min(points.amount, base);
      points = { ...points, amount };
      const productDiscount = Math.round((totals.productDiscount + amount) * 100) / 100;
      totals = { ...totals, productDiscount, discountAmount: productDiscount + totals.deliveryDiscount, total: Math.round((totals.total - amount) * 100) / 100 };
    }
  }

  return {
    ok: true,
    items,
    delivery: { choice, option, market: marketPick },
    discount: applied,
    codeError,
    points,
    totals,
    stockHolds,
  };
}
