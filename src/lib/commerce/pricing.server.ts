import "server-only";
import { db } from "@/lib/db/client";
import { lockedEmailError } from "@/lib/marketing/popup-rewards";
import { bestAutomaticDiscount, discountAmount, describeDiscount, parseDiscountConfig, redemptionError, type DiscountLine } from "@/lib/discounts";
import { contactsInSegment, segmentRules } from "@/lib/marketing/contacts";
import { readGameConfig } from "@/lib/gamification/logic";
import { quotePoints, type PointsRedemption } from "@/lib/gamification/loyalty.server";
import { buildStockHolds, stockShortfalls, type StockHold } from "@/lib/commerce/stock-holds";
import { maybeExpireUnpaidOrders } from "@/lib/commerce/order-expiry.server";
import {
  chooseDelivery,
  deliveryOptionsFor,
  linePrice,
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
  variant?: string;
  image?: string;
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
  delivery: { choice: DeliveryChoice; option: DeliveryOption | null };
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
  store: { id: string; brandSettings: unknown };
  items: Array<{ productId: string; quantity: number; variant?: string | null }>;
  address: { city?: string; state?: string };
  deliveryOptionId?: string | null;
  discountCode?: string | null;
  buyerEmail?: string | null;
  settings: Pick<CheckoutSettings, "enableCoupon">;
  /** Loyalty points the shopper wants to use; needs buyerEmail and the phone from an earlier order. */
  loyalty?: { points: number; phone?: string | null } | null;
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
      // Dropship products sell from the supplier's stock (the seller holds none).
      fulfillmentType: true, supplierProductId: true, supplierProduct: { select: { id: true, stockQuantity: true, status: true } },
    },
  });
  if (products.length !== quantities.size) return { ok: false, message: "One or more items in your bag are no longer available. Remove them and try again." };

  const short = stockShortfalls(products, quantities);
  if (short.length) return { ok: false, message: `Not enough stock for: ${short.join(", ")}. Lower the quantity and try again.` };
  const stockHolds = buildStockHolds(products, quantities);

  const byId = new Map(products.map((product) => [product.id, product]));
  const merged = new Map<string, PricedItem>();
  for (const line of input.items) {
    const product = byId.get(line.productId)!;
    const variant = line.variant?.trim() || undefined;
    const key = `${product.id}::${variant ?? ""}`;
    const existing = merged.get(key);
    if (existing) {
      existing.quantity += line.quantity;
      continue;
    }
    merged.set(key, {
      productId: product.id,
      name: variant ? `${product.name} (${variant})` : product.name,
      price: linePrice(product.retailPrice, product.variants, variant),
      quantity: line.quantity,
      ...(variant ? { variant } : {}),
      ...(product.images[0] ? { image: product.images[0] } : {}),
    });
  }
  const items = [...merged.values()];
  const subtotal = items.reduce((sum, item) => sum + item.price * item.quantity, 0);

  const zones = await db.shippingZone.findMany({
    where: { storeId: input.store.id, active: true },
    orderBy: { sortOrder: "asc" },
    select: { name: true, regions: true, rates: true },
  });
  const flatRate = Number(record(record(input.store.brandSettings).shippingConfig).flatRate ?? 0) || 0;
  const choice = deliveryOptionsFor(zones, flatRate, input.address, subtotal);
  const { option, fee } = chooseDelivery(choice, input.deliveryOptionId);

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

  if (!applied) {
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
    delivery: { choice, option },
    discount: applied,
    codeError,
    points,
    totals,
    stockHolds,
  };
}
