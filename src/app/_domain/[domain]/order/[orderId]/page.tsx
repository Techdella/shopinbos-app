import { shopperOrder } from "@/lib/commerce/stock-holds";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { updateOrderPayment } from "@/app/actions/payments";
import { refreshKorapayOrderPayment } from "@/lib/commerce/korapay-orders.server";
import { OrderConfirmation } from "@/app/s/[slug]/order/[orderId]/OrderConfirmation";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";
import { loadOrderNextSteps } from "@/app/s/[slug]/order/[orderId]/order-props";
import { payAtDoorView } from "@/lib/commerce/pay-at-door.server";
import { customerRefundPanel } from "@/lib/commerce/order-refunds.server";

interface Props {
  params: Promise<{ domain: string; orderId: string }>;
  searchParams: Promise<{ reference?: string; gateway?: string }>;
}

export default async function CustomDomainOrderPage({ params, searchParams }: Props) {
  const { domain, orderId } = await params;
  const { reference, gateway } = await searchParams;

  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();

  // Paystack redirected here with a reference: confirm it with Paystack before marking the order paid.
  // The reference is visible to the buyer, so it is never trusted on its own.
  // Korapay also adds ?reference= (its own, with ?gateway=korapay): that one is not a Paystack reference.
  if (reference && !gateway) {
    await updateOrderPayment(orderId, reference).catch(() => null);
  }
  // Korapay orders are confirmed with Korapay when the shopper lands here, never from the URL.
  await refreshKorapayOrderPayment(orderId);

  const order = await db.retailOrder.findUnique({ where: { id: orderId } });
  if (!order) notFound();

  const store = await db.store.findUnique({
    where: { id: order.storeId, slug: storeRef.slug },
    select: { id: true, userId: true, name: true, slug: true, logoUrl: true, currency: true, brandSettings: true },
  });
  if (!store) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);

  const [next, refundPanel] = await Promise.all([
    loadOrderNextSteps(order, store),
    customerRefundPanel(order.id).catch(() => ({ refunds: [], lateParts: [], refundBanks: [] as string[] })),
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
      payAtDoor={payAtDoorView(order)}
      {...refundPanel}
    />
  );
}
