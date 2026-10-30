import "server-only";
import { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { mergeShopper, shopperFactsFromOrder, type ShopperOrderFacts } from "@shared/shoppers";
import { addOrderFollower } from "@/lib/followers/followers.server";

// Keeps the phone-keyed customer records ("Shopper", "ShopperStore"; shared/shoppers.ts) up to date as sellers take
// orders. Called once when an order is created: storefront checkout (and payment links, which check out there) and
// recorded sales (src/lib/orders/record-sale.ts). Never throws into the order flow. Sellers never see these rows
// across stores: nothing seller-facing reads another store's ShopperStore.

export interface ShopperOrder {
  id: string;
  storeId: string;
  buyerPhone?: string | null;
  buyerName?: string | null;
  buyerEmail?: string | null;
  deliveryAddress?: unknown;
  total?: number | string | null;
  createdAt?: Date | string | null;
}

const isUniqueClash = (error: unknown) => error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";

async function saveShopper(facts: ShopperOrderFacts, attempt = 0): Promise<string> {
  const existing = await db.shopper.findUnique({ where: { phone: facts.phone } });
  const merged = mergeShopper(existing, facts);
  if (existing) {
    await db.shopper.update({ where: { id: existing.id }, data: merged });
    return existing.id;
  }
  try {
    const created = await db.shopper.create({ data: { phone: facts.phone, ...merged }, select: { id: true } });
    return created.id;
  } catch (error) {
    // Another order for the same number created it a moment ago: merge into that one.
    if (isUniqueClash(error) && attempt === 0) return saveShopper(facts, 1);
    throw error;
  }
}

/** Counts the order at its store once: a repeat call for the store's latest counted order changes nothing. */
async function countStoreOrder(shopperId: string, order: ShopperOrder, facts: ShopperOrderFacts, attempt = 0): Promise<void> {
  const updated = await db.shopperStore.updateMany({
    where: { shopperId, storeId: order.storeId, OR: [{ lastOrderId: null }, { lastOrderId: { not: order.id } }] },
    data: { orderCount: { increment: 1 }, totalSpent: { increment: facts.total }, lastOrderAt: facts.at, lastOrderId: order.id },
  });
  if (updated.count) return;
  const exists = await db.shopperStore.findUnique({ where: { shopperId_storeId: { shopperId, storeId: order.storeId } }, select: { id: true } });
  if (exists) return; // Already counted.
  try {
    await db.shopperStore.create({
      data: { shopperId, storeId: order.storeId, firstOrderAt: facts.at, lastOrderAt: facts.at, lastOrderId: order.id, orderCount: 1, totalSpent: facts.total },
    });
  } catch (error) {
    if (isUniqueClash(error) && attempt === 0) return countStoreOrder(shopperId, order, facts, 1);
    throw error;
  }
}

/**
 * Creates or updates the shopper for a new order (by its phone number) and their record at the order's store.
 * Orders without a usable phone number are skipped. Never throws: a failure is logged and the order goes on.
 */
export async function recordShopperOrder(order: ShopperOrder): Promise<void> {
  try {
    if (!order.buyerPhone?.trim()) return;
    // The store's currency says which country a local number ("0244…") is from.
    const store = await db.store.findUnique({ where: { id: order.storeId }, select: { currency: true } });
    const facts = shopperFactsFromOrder(order, store?.currency);
    if (!facts) return;
    const shopperId = await saveShopper(facts);
    await countStoreOrder(shopperId, order, facts);
    // Everyone who buys from a shop follows it (Notify my followers); never throws.
    await addOrderFollower(order.storeId, shopperId);
  } catch (error) {
    console.error(`[shoppers] could not record order ${order.id}`, error);
  }
}
