import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, EmptyState, PillLink } from "@/components/app-kit";
import { TipsGate } from "../_components/TipsGate";
import { requireRole } from "@/lib/server-auth";
import { safeQuery } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { wholesaleRef } from "@/lib/supplier-orders/wholesale.server";
import { WHOLESALE_PAY_PREFIX, confirmWholesalePayment, payableWholesaleOrders } from "@/lib/supplier-orders/wholesale-payments.server";
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
export default async function SellerWholesaleOrdersPage({ searchParams }: { searchParams: Promise<{ reference?: string; trxref?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");

  // Back from Paystack after "Pay": confirm with Paystack before saying it's paid (the webhook does the same).
  const query = await searchParams;
  const reference = String(query.reference ?? query.trxref ?? "").slice(0, 60);
  const payment = reference.startsWith(WHOLESALE_PAY_PREFIX) ? await confirmWholesalePayment(reference, user.id).catch(() => null) : null;

  const orders = await safeQuery(() => db.wholesaleOrder.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true, status: true, rejectReason: true, trackingCode: true, quantity: true, unitPrice: true, totalPrice: true, currency: true, createdAt: true, paidAt: true, paidOutAt: true,
      supplier: { select: { displayName: true, slug: true, userId: true } },
      supplierProduct: { select: { id: true, name: true, images: true } },
    },
  }), []);

  const payable = await payableWholesaleOrders(orders).catch(() => new Set<string>());
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
    paid: !!order.paidAt,
    canPay: payable.has(order.id),
  }));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("ws.title")}
      sub={t("ws.lead")}
      actions={<PillLink href="/marketplace" icon="search">{t("ws.findProducts")}</PillLink>}
    >
      <div className="mb-4">
        <TipsGate>
          <AssistantNote who="peggy">{t("ws.tip")}</AssistantNote>
        </TipsGate>
      </div>
      {payment && (
        <p role={payment.ok ? "status" : "alert"} className={`mb-4 rounded-[16px] px-4 py-3 text-[14px] font-bold ${payment.ok ? "bg-app-success-tint text-app-success" : "bg-app-danger-tint text-app-danger"}`}>
          {payment.ok ? t("ws.paidNotice") : payment.error}
        </p>
      )}
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
