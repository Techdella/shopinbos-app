import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { updateOrderPayment } from "@/app/actions/payments";
import { OrderConfirmation } from "./OrderConfirmation";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ slug: string; orderId: string }>;
  searchParams: Promise<{ reference?: string }>;
}

export default async function OrderPage({ params, searchParams }: Props) {
  const { slug, orderId } = await params;
  const { reference } = await searchParams;

  // Paystack redirected here with a reference: confirm it with Paystack before marking the order paid.
  // The reference is visible to the buyer, so it is never trusted on its own.
  if (reference) {
    await updateOrderPayment(orderId, reference).catch(() => null);
  }

  const order = await db.retailOrder.findUnique({ where: { id: orderId } });
  if (!order) notFound();

  const store = await db.store.findUnique({
    where: { id: order.storeId },
    select: { id: true, name: true, slug: true, logoUrl: true, currency: true, brandSettings: true },
  });
  if (!store || store.slug !== slug) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), slug);

  return <OrderConfirmation order={JSON.parse(JSON.stringify(order))} store={store} storeBasePath={storeBasePath} />;
}
