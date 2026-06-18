import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { CartPageClient } from "./CartPageClient";

export default async function PublicStoreCartPage({ params }: { params: Promise<{ storeSlug: string }> }) {
  const { storeSlug } = await params;
  const store = await db.store.findUnique({
    where: { slug: storeSlug },
    select: {
      name: true,
      slug: true,
      currency: true,
      brandSettings: true,
      status: true,
    },
  });

  if (!store || store.status !== "active") notFound();

  return <CartPageClient store={store} />;
}
