import "server-only";
import { db } from "@/lib/db/client";
import { upsertStoreVisitor } from "@/lib/storefront/visitor-data";
import { isDropshipProduct, storeAvailable, storeStockMode } from "@/lib/commerce/stock-holds";
import { seedDefaultAbandonedCartAutomation } from "@/lib/automations/defaults";
import {
  cartSubtotal,
  clampQuantity,
  furthestStep,
  isRecoveryToken,
  linePrice,
  newRecoveryToken,
  sanitizeLines,
  type CartLine,
} from "@shared/cart-checkout";

// Abandoned carts: a checkout that has a way to reach the shopper (email or phone) is saved as an
// AbandonedCartEvent and kept up to date as the bag and the checkout step change. The marketing automation
// (agent A) reminds shoppers about carts with recoveredAt = null; the reminder links to
// /s/[slug]/cart?recover=<recoveryToken>, which restores the bag. Placing an order marks the cart recovered.

const MATCH_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
const RECOVER_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

export interface CaptureInput {
  store: { id: string; name: string; currency: string };
  visitorKey: string;
  email?: string | null;
  phone?: string | null;
  name?: string | null;
  items: CartLine[];
  step?: string | null;
  discountCode?: string | null;
  /** The token this browser was given last time, so it keeps updating the same cart. */
  token?: string | null;
}

/** Saves or updates this shopper's open cart. Returns its recovery token, or null when there is nothing to save. */
export async function captureAbandonedCart(input: CaptureInput): Promise<{ token: string } | null> {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const items = sanitizeLines(input.items);
  if ((!email && !phone) || items.length === 0) return null;

  const visitorId = await upsertStoreVisitor({ storeId: input.store.id, visitorKey: input.visitorKey, email, name: input.name, phone });
  await seedDefaultAbandonedCartAutomation(input.store).catch(() => null);

  const open = { storeId: input.store.id, recoveredAt: null };
  const existing =
    (isRecoveryToken(input.token) ? await db.abandonedCartEvent.findFirst({ where: { ...open, recoveryToken: input.token } }) : null) ??
    (await db.abandonedCartEvent.findFirst({
      where: {
        ...open,
        createdAt: { gte: new Date(Date.now() - MATCH_WINDOW_MS) },
        OR: [visitorId ? { visitorId } : null, email ? { email } : null, phone ? { phone } : null].filter((entry): entry is NonNullable<typeof entry> => entry !== null),
      },
      orderBy: { updatedAt: "desc" },
    }));

  const data = {
    items: JSON.parse(JSON.stringify(items)),
    subtotal: cartSubtotal(items),
    currency: input.store.currency,
    ...(email ? { email } : {}),
    ...(phone ? { phone } : {}),
    ...(input.name?.trim() ? { name: input.name.trim().slice(0, 120) } : {}),
    ...(input.discountCode?.trim() ? { discountCode: input.discountCode.trim().toUpperCase().slice(0, 40) } : {}),
  };

  if (existing) {
    const token = existing.recoveryToken ?? newRecoveryToken();
    await db.abandonedCartEvent.update({
      where: { id: existing.id },
      data: {
        ...data,
        visitorId: existing.visitorId ?? visitorId,
        status: "open",
        recoveryToken: token,
        checkoutStep: furthestStep(existing.checkoutStep, input.step),
      },
    });
    return { token };
  }

  const token = newRecoveryToken();
  await db.abandonedCartEvent.create({
    data: {
      ...data,
      storeId: input.store.id,
      visitorId,
      status: "open",
      recoveryToken: token,
      checkoutStep: furthestStep(null, input.step),
    },
  });
  return { token };
}

/** Marks the shopper's open carts as recovered by this order: the cart this browser used, and any by the same email or phone. */
export async function markCartRecovered(input: { storeId: string; orderId: string; token?: string | null; email?: string | null; phone?: string | null }) {
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone?.trim() || null;
  const matches = [isRecoveryToken(input.token) ? { recoveryToken: input.token } : null, email ? { email } : null, phone ? { phone } : null].filter(
    (entry): entry is NonNullable<typeof entry> => entry !== null,
  );
  if (matches.length === 0) return 0;
  const result = await db.abandonedCartEvent.updateMany({
    where: { storeId: input.storeId, recoveredAt: null, createdAt: { gte: new Date(Date.now() - RECOVER_WINDOW_MS) }, OR: matches },
    data: { recoveredAt: new Date(), status: "recovered", orderId: input.orderId },
  });
  return result.count;
}

export interface RestoredCart {
  token: string;
  items: CartLine[];
  /** Lines that are no longer for sale, by name, so the shopper is told rather than surprised. */
  unavailable: string[];
  contact: { name: string; email: string; phone: string };
  discountCode: string | null;
  recovered: boolean;
}

/** The cart behind a recovery link, re-priced from today's products. Null when the token is unknown. */
export async function restoreAbandonedCart(storeId: string, token: string): Promise<RestoredCart | null> {
  if (!isRecoveryToken(token)) return null;
  const event = await db.abandonedCartEvent.findFirst({ where: { storeId, recoveryToken: token } });
  if (!event) return null;

  const saved = sanitizeLines(event.items);
  const products = await db.storeProduct.findMany({
    where: { storeId, id: { in: [...new Set(saved.map((line) => line.productId))] }, status: "published" },
    select: {
      id: true, name: true, images: true, retailPrice: true, variants: true,
      currentStock: true, reservedStock: true, trackStock: true, continueSellingWhenOut: true,
      fulfillmentType: true, supplierProductId: true, supplierProduct: { select: { id: true, stockQuantity: true, status: true } },
    },
  });
  const byId = new Map(products.map((product) => [product.id, product]));
  const items: CartLine[] = [];
  const unavailable: string[] = [];
  for (const line of saved) {
    const product = byId.get(line.productId);
    // What can still be bought: the supplier's stock (dropship), what is left of tracked stock, else no limit.
    const left = !product
      ? 0
      : isDropshipProduct(product)
        ? product.supplierProduct!.status === "published" ? product.supplierProduct!.stockQuantity : 0
        : storeStockMode(product) === "strict" ? storeAvailable(product) : null;
    if (!product || (left !== null && left <= 0)) {
      unavailable.push(line.name);
      continue;
    }
    items.push({
      ...line,
      price: linePrice(product.retailPrice, product.variants, line.variant),
      image: line.image ?? product.images[0],
      ...(left !== null ? { maxQuantity: left, quantity: clampQuantity(line.quantity, left) } : {}),
    });
  }

  if (!event.recoveredAt) {
    await db.abandonedCartEvent.update({ where: { id: event.id }, data: { restoredAt: new Date() } }).catch(() => null);
  }

  return {
    token,
    items,
    unavailable,
    contact: { name: event.name ?? "", email: event.email ?? "", phone: event.phone ?? "" },
    discountCode: event.discountCode,
    recovered: Boolean(event.recoveredAt),
  };
}
