import "server-only";

import { db } from "@/lib/db/client";
import { shopsSellingCounts } from "@/lib/marketplace/find";
import { sellerState } from "@/lib/marketplace/quick-add.server";
import { originOf, DEFAULT_SETTINGS } from "@/lib/delivery-market/market.server";
import { dropshipUnitPrice } from "@shared/dropship-rules";
import { placeOf } from "@shared/delivery-market";
import { CUSTOMER_DAYS, customerPlacesFrom, nearMyCustomers, type CustomerPlaces } from "@shared/near-customers";
import { sampleOfferFor, type SampleOffer } from "@shared/samples";

// What Find adds to the supplier products a seller looks at (web /marketplace and the phone's Find):
//   - "N shops selling": shops with it live in their store (shared find.ts shopsSellingCounts);
//   - "Near my customers": suppliers close to where the seller's recent orders went (shared/near-customers.ts);
//   - the one sample at the dropship price (shared/samples.ts) and whether the seller already ordered it.

/** Live listings per supplier product, each shop counted once. Never throws (an empty map hides the line). */
export async function shopsSellingFor(supplierProductIds: readonly string[]): Promise<Map<string, number>> {
  const ids = [...new Set(supplierProductIds)].slice(0, 500);
  if (!ids.length) return new Map();
  try {
    const rows = await db.storeProduct.groupBy({ by: ["supplierProductId", "storeId"], where: { supplierProductId: { in: ids }, status: "published" } });
    return shopsSellingCounts(rows);
  } catch (error) {
    console.error("[find] could not count shops selling", error);
    return new Map();
  }
}

/** Order statuses that mean a customer really ordered (paid or on its way), for where the customers are. */
const COUNTED = ["paid", "processing", "packed", "shipped", "delivered", "awaiting_payment"] as const;

/** Where this seller's customers are: the busiest delivery states and areas of the last 90 days, else the shop's state. */
export async function customerPlacesFor(userId: string, now = new Date()): Promise<CustomerPlaces> {
  const store = await db.store.findUnique({ where: { userId }, select: { id: true } }).catch(() => null);
  const since = new Date(now.getTime() - CUSTOMER_DAYS * 86_400_000);
  const [orders, state] = await Promise.all([
    store ? db.retailOrder.findMany({ where: { storeId: store.id, createdAt: { gte: since }, status: { in: [...COUNTED] } }, select: { deliveryAddress: true }, orderBy: { createdAt: "desc" }, take: 500 }).catch(() => []) : Promise.resolve([]),
    sellerState(userId).catch(() => null),
  ]);
  return customerPlacesFrom(orders.map((order) => order.deliveryAddress), state);
}

/** For each supplier: does it ship near the seller's customers? (its pickup origin, rate card and zone). */
export async function nearCustomersFor(customers: CustomerPlaces, suppliers: ReadonlyArray<{ id: string; userId?: string | null; city: string; address?: string | null }>): Promise<Set<string>> {
  const out = new Set<string>();
  if (!customers.states.length || !suppliers.length) return out;
  const userIds = suppliers.map((supplier) => supplier.userId).filter((id): id is string => Boolean(id));
  const settings = userIds.length
    ? await db.deliverySettings.findMany({ where: { userId: { in: userIds } } }).catch(() => [])
    : [];
  for (const supplier of suppliers) {
    const delivery = settings.find((row) => row.userId === supplier.userId) ?? null;
    let origin = originOf(delivery ?? DEFAULT_SETTINGS, supplier.city);
    if (!origin.state && supplier.address) origin = placeOf({ city: supplier.address.split(",").pop() ?? "" });
    if (nearMyCustomers({ origin, rateSource: delivery?.rateSource ?? null, zoneRates: delivery?.zoneRates ?? null }, customers)) out.add(supplier.id);
  }
  return out;
}

/**
 * The one-sample offer on a product page: its price (the dropship price) and the seller's live sample, if any. Like
 * wholesale orders, samples come from verified suppliers only (src/lib/supplier-orders/wholesale.server.ts).
 */
export async function sampleOfferForSeller(sellerId: string, product: { id: string; sampleAvailable: boolean; wholesalePrice: number; priceMode?: string | null; dropshipPrice?: number | null; supplier: { verificationStatus: string } }): Promise<SampleOffer | null> {
  if (!product.sampleAvailable || product.supplier.verificationStatus !== "verified") return null;
  const previous = await db.wholesaleOrder.findMany({ where: { sellerId, supplierProductId: product.id, sample: true }, select: { id: true, status: true }, orderBy: { createdAt: "desc" }, take: 5 }).catch(() => []);
  return sampleOfferFor({ sampleAvailable: product.sampleAvailable, price: dropshipUnitPrice(product), previous: previous.map((row) => ({ id: row.id, status: String(row.status) })) });
}
