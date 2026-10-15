import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getT } from "@/lib/i18n/server";
import { linkProductView } from "@/lib/payment-links/pure";
import { listPaymentLinks, LINK_STORE_SELECT, paymentReadiness } from "@/lib/payment-links/service.server";
import { PaymentLinksManager } from "./PaymentLinksManager";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("paylinks");
  return { title: t("list.metaTitle") };
}

export default async function PaymentLinksPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("paylinks");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { ...LINK_STORE_SELECT, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const [links, readiness, products] = await Promise.all([
    listPaymentLinks(store, { limit: 200 }),
    paymentReadiness(store.id),
    db.storeProduct.findMany({ where: { storeId: store.id, status: "published" }, orderBy: [{ soldStock: "desc" }, { createdAt: "desc" }], take: 500, select: { id: true, name: true, retailPrice: true, images: true, variants: true } }),
  ]);

  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("list.title")} sub={t("list.sub")}>
      <PaymentLinksManager links={links} ready={readiness.ready} storeName={store.name} catalog={products.map(linkProductView)} />
    </SellerPage>
  );
}
