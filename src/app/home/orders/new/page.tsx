import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, pillLink, storeSummary } from "@/components/seller/SellerPage";
import { RecordSaleForm } from "./RecordSaleForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Record a sale" };

export default async function RecordSalePage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id, status: { not: "archived" } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 200,
        select: { id: true, name: true, retailPrice: true, images: true, currentStock: true },
      })
    : [];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Record a sale"
      sub="Sold something on WhatsApp, Instagram or in person? Add it here so your sales, stock and customers stay right."
      actions={<Link href="/home/orders" className={pillLink.white}>All orders</Link>}
    >
      <RecordSaleForm
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.retailPrice,
          image: product.images[0] ?? null,
          stock: product.currentStock,
        }))}
      />
    </SellerPage>
  );
}
