import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { db } from "@/lib/db/client";
import { OrderConfirmation } from "@/app/s/[slug]/order/[orderId]/OrderConfirmation";
import { getStoreByCustomDomain } from "@/lib/domains/lookup";
import { getStorefrontBasePathForHost } from "@/lib/domains/storefront";

interface Props {
  params: Promise<{ domain: string; orderId: string }>;
  searchParams: Promise<{ reference?: string }>;
}

export default async function CustomDomainOrderPage({ params, searchParams }: Props) {
  const { domain, orderId } = await params;
  const { reference } = await searchParams;

  const storeRef = await getStoreByCustomDomain(domain);
  if (!storeRef) notFound();

  if (reference) {
    await db.retailOrder.updateMany({
      where: { id: orderId, paystackRef: reference, status: "pending" },
      data: { status: "paid", paystackStatus: "success" },
    });
  }

  const order = await db.retailOrder.findUnique({ where: { id: orderId } });
  if (!order) notFound();

  const store = await db.store.findUnique({
    where: { id: order.storeId, slug: storeRef.slug },
    select: { id: true, name: true, slug: true, logoUrl: true, currency: true, brandSettings: true },
  });
  if (!store) notFound();

  const requestHeaders = await headers();
  const storeBasePath = getStorefrontBasePathForHost(requestHeaders.get("host"), storeRef.slug);

  return <OrderConfirmation order={JSON.parse(JSON.stringify(order))} store={store} storeBasePath={storeBasePath} />;
}
