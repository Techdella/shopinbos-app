import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { wholesaleRef } from "@/lib/supplier-orders/wholesale.server";
import { WholesaleOrders, type SellerWholesaleRow } from "../_components/WholesaleOrders";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Wholesale orders" };

const placedFormat = new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", year: "numeric", timeZone: "Africa/Lagos" });

// Sourcing → Find products → Wholesale orders: stock the seller bought from suppliers, newest first.
export default async function SellerWholesaleOrdersPage() {
  const user = await requireRole(["seller"], "/login");
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
    placed: placedFormat.format(order.createdAt),
    supplier: { name: order.supplier.displayName, slug: order.supplier.slug },
    product: { id: order.supplierProduct.id, name: order.supplierProduct.name, image: order.supplierProduct.images[0] ?? null },
  }));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Wholesale orders"
      sub="Stock you bought from suppliers. You can cancel an order until the supplier starts packing it; they send you an invoice and you pay them directly."
      actions={<PillLink href="/marketplace" icon="search">Find products</PillLink>}
    >
      {rows.length ? (
        <WholesaleOrders initial={rows} />
      ) : (
        <EmptyState icon="box" title="No wholesale orders yet" action={<PillLink href="/marketplace" tone="ink">Find products</PillLink>}>
          Buy stock from a verified supplier at their wholesale price. Your orders and their progress show up here.
        </EmptyState>
      )}
    </SellerPage>
  );
}
