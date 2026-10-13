import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { wholesaleRef } from "@/lib/supplier-orders/wholesale.server";
import { WholesaleOrders, type SellerWholesaleRow } from "../_components/WholesaleOrders";
import { formatDate } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketplace");
  return { title: t("ws.title") };
}

const placedFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

// Sourcing → Find products → Wholesale orders: stock the seller bought from suppliers, newest first.
export default async function SellerWholesaleOrdersPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  const orders = await safeQuery(() => db.wholesaleOrder.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, status: true, rejectReason: true, trackingCode: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, createdAt: true,
      supplier: { select: { displayName: true, slug: true } },
      supplierProduct: { select: { id: true, name: true, images: true } },
    },
  }), []);

  const rows: SellerWholesaleRow[] = orders.map((order) => ({
    id: order.id,
    ref: wholesaleRef(order.id),
    status: order.status,
    rejectReason: order.rejectReason,
    trackingCode: order.trackingCode,
    quantity: order.quantity,
    unitPrice: order.unitPrice,
    totalPrice: order.totalPrice,
    currency: order.currency,
    placed: locale === "en" ? placedFormat.format(order.createdAt) : formatDate(order.createdAt, locale),
    supplier: { name: order.supplier.displayName, slug: order.supplier.slug },
    product: { id: order.supplierProduct.id, name: order.supplierProduct.name, image: order.supplierProduct.images[0] ?? null },
  }));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("ws.title")}
      sub={t("ws.sub")}
      actions={<PillLink href="/marketplace" icon="search">{t("ws.findProducts")}</PillLink>}
    >
      {rows.length ? (
        <WholesaleOrders initial={rows} />
      ) : (
        <EmptyState icon="box" title={t("ws.empty")} action={<PillLink href="/marketplace" tone="ink">{t("ws.findProducts")}</PillLink>}>
          {t("ws.emptySub")}
        </EmptyState>
      )}
    </SellerPage>
  );
}
