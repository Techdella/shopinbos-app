import "server-only";

import { after } from "next/server";
import { db } from "@/lib/db/client";
import { PAID_RETAIL_STATUSES } from "@/lib/supplier-orders/pure";
import { trackServerEvent, type ServerEvent } from "./track.server";

// The seller's value moments, sent from the server to Shopinbos's own analytics (Mixpanel, PostHog, GA4) against the
// seller's Supabase user id, the same id the browser identifies them with:
//   store_published       the store went live (Publish in the builder, or Rex's first build)
//   product_added         a product was added to the store (own, from a supplier, dropship, import, AI builder)
//   first_order_received  the store's first order: paid online, or placed as pay on delivery
// Each one runs after the response (next/server after()), so the seller never waits on it, and never throws.

type Properties = NonNullable<ServerEvent["properties"]>;

/** After the response when there is one (route handlers, server actions); otherwise straight away, unawaited. */
function later(job: () => Promise<void>) {
  try {
    after(job);
  } catch {
    void job();
  }
}

async function sellerDistinctId(where: { userId?: string; storeId?: string }) {
  const userId = where.userId ?? (where.storeId ? (await db.store.findUnique({ where: { id: where.storeId }, select: { userId: true } }))?.userId : undefined);
  if (!userId) return null;
  return (await db.user.findUnique({ where: { id: userId }, select: { supabaseId: true } }))?.supabaseId ?? null;
}

async function sendSellerEvent(input: { userId?: string; storeId?: string; event: string; properties?: Properties; insertId?: string }) {
  try {
    const distinctId = await sellerDistinctId(input);
    if (!distinctId) return;
    await trackServerEvent({ event: input.event, distinctId, properties: input.properties, insertId: input.insertId });
  } catch (error) {
    console.warn("[analytics] seller event failed:", input.event, error instanceof Error ? error.message.slice(0, 200) : "unknown");
  }
}

/** One event for the seller who owns the store (`storeId`) or the account (`userId`). */
export function trackSellerEvent(input: { userId?: string; storeId?: string; event: string; properties?: Properties; insertId?: string }) {
  later(() => sendSellerEvent(input));
}

/** store_published; `firstTime` when the store wasn't live before. */
export function trackStorePublished(storeId: string, firstTime: boolean) {
  trackSellerEvent({ storeId, event: "store_published", properties: { is_first_publish: firstTime } });
}

/** product_added; `count` > 1 for a bulk import, sent as one event (never one per row). */
export function trackProductAdded(input: { userId?: string; storeId?: string; source: string; count?: number; fromSupplier?: boolean }) {
  trackSellerEvent({
    userId: input.userId,
    storeId: input.storeId,
    event: "product_added",
    properties: { source: input.source, product_count: input.count ?? 1, is_from_supplier: input.fromSupplier ?? false },
  });
}

/**
 * first_order_received, when this order is the store's first that counts (paid online, or pay on delivery and not
 * cancelled). The insert id is per store, so a webhook replay or two orders landing together still count once.
 */
export function trackFirstOrderIfFirst(orderId: string) {
  later(() => sendFirstOrderIfFirst(orderId));
}

async function sendFirstOrderIfFirst(orderId: string) {
  try {
    const order = await db.retailOrder.findUnique({ where: { id: orderId }, select: { id: true, storeId: true, total: true, currency: true, paymentMethod: true } });
    if (!order) return;
    const earlier = await db.retailOrder.count({
      where: {
        storeId: order.storeId,
        id: { not: order.id },
        OR: [{ status: { in: [...PAID_RETAIL_STATUSES] } }, { paymentMethod: "pay_on_delivery", status: { notIn: ["cancelled", "refunded", "returned"] } }],
      },
    });
    if (earlier > 0) return;
    await sendSellerEvent({
      storeId: order.storeId,
      event: "first_order_received",
      insertId: `fo-${order.storeId}`,
      properties: { order_total: Number(order.total), currency: order.currency, payment_method: order.paymentMethod ?? "paystack" },
    });
  } catch (error) {
    console.warn("[analytics] first order check failed:", error instanceof Error ? error.message.slice(0, 200) : "unknown");
  }
}
