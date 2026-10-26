import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, pillLink, storeSummary } from "@/components/seller/SellerPage";
import { RecordSaleForm } from "./RecordSaleForm";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("orders");
  return { title: t("new.metaTitle") };
}

export default async function RecordSalePage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("orders");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id, status: { not: "archived" } },
        orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }],
        take: 200,
        select: { id: true, name: true, shortCode: true, retailPrice: true, images: true, currentStock: true, trackStock: true },
      })
    : [];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("new.metaTitle")}
      sub={t("new.sub")}
      actions={<Link href="/home/orders" className={pillLink.white}>{t("allOrders")}</Link>}
    >
      <PageTip className="mb-5">{tipT("orders.new")}</PageTip>
      <RecordSaleForm
        products={products.map((product) => ({
          id: product.id,
          name: product.name,
          price: product.retailPrice,
          image: product.images[0] ?? null,
          // Null: the seller doesn't count this product's stock.
          stock: product.trackStock ? product.currentStock : null,
          shortCode: product.shortCode,
        }))}
      />
    </SellerPage>
  );
}
