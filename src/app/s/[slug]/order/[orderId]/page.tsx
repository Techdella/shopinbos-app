import type { Metadata } from "next";
import { shopperOrder } from "@/lib/commerce/stock-holds";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { updateOrderPayment } from "@/app/actions/payments";
import { refreshKorapayOrderPayment } from "@/lib/commerce/korapay-orders.server";
import { OrderConfirmation } from "./OrderConfirmation";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadOrderNextSteps } from "./order-props";
import { orderRewards } from "@/lib/gamification/play.server";
import { shopperBalanceView } from "@/lib/commerce/store-balance.server";

// A shopper's own order: never listed by search engines.
export const metadata: Metadata = { title: "Your order", robots: { index: false, follow: false } };

interface Props {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ reference?: string; gateway?: string }>;
}

export default async function OrderPage({ params, searchParams }: Props) {
  const { slug, orderId } = await params;
  const { reference, gateway } = await searchParams;

  // Paystack redirected here with a reference: confirm it with Paystack before marking the order paid.
  // The reference is visible to the buyer, so it is never trusted on its own. "Pay the rest" of a preorder comes
  // back with its own reference (sbal-…), confirmed the same way (updateOrderPayment).
  // Korapay also adds ?reference= (its own, with ?gateway=korapay): that one is not a Paystack reference.
  if (reference && !gateway) {
    await updateOrderPayment(orderId, reference).catch(() => null);
  }
  // Korapay orders are confirmed with Korapay when the shopper lands here, never from the URL.
  await refreshKorapayOrderPayment(orderId);

  const order = await db.retailOrder.findUnique({ where: { id: orderId } });
  if (!order) notFound();

  const store = await db.store.findUnique({
    where: { id: order.storeId },
    select: { id: true, userId: true, name: true, slug: true, logoUrl: true, currency: true, brandSettings: true },
  });
  if (!store || store.slug !== slug) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  const [next, rewards] = await Promise.all([
    loadOrderNextSteps(order, store),
    // Loyalty points and the post-purchase spin (Marketing > Rewards); never blocks the page.
    orderRewards(store, order).catch(() => null),
  ]);
  const publicStore = { name: store.name, slug: store.slug, logoUrl: store.logoUrl, currency: store.currency, brandSettings: next.brandSettings };

  return (
    <OrderConfirmation
      order={JSON.parse(JSON.stringify(shopperOrder(order)))}
      store={publicStore}
      storeBasePath={storeBasePath}
      transfer={next.transfer}
      deliveryCode={next.deliveryCode}
      brandedTracking={next.brandedTracking}
      delivery={next.delivery ? JSON.parse(JSON.stringify(next.delivery)) : null}
      rewards={rewards ? JSON.parse(JSON.stringify(rewards)) : null}
      balance={shopperBalanceView(order)}
    />
  );
}
