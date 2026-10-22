import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { getT } from "@/lib/i18n/server";
import { isMissingTable } from "@/lib/rate-limit-core";
import { PRINT_ORDER_STATUS_LABEL, type PrintOrderStatus } from "@shared/print-orders";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";
import { PageTip } from "@/components/learn/PageTip";

const PAGE_SIZE = 30;

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("packaging");
  return { title: t("orders.title") };
}

const STATUS_TONE: Record<string, string> = {
  awaiting_payment: "bg-app-canvas text-app-ink-soft",
  paid: "bg-[#E8F0FF] text-[#2F4FA8]",
  printing: "bg-[#FDF0D5] text-[#8A5A00]",
  shipped: "bg-[#E3F4EF] text-[#1F6B5C]",
  delivered: "bg-[#E3F4EF] text-[#1F6B5C]",
  cancelled: "bg-app-canvas text-app-ink-soft",
};

// The seller's print orders: what they ordered, what it cost, where it is. ?paid= comes back from Paystack.
export default async function PrintOrdersPage({ searchParams }: { searchParams: Promise<{ paid?: string; page?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("packaging");
  const { paid, page } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  let orders: Array<{ id: string; title: string; previewUrl: string | null; quantity: number; material: string; finish: string; total: number; days: number; status: string; tracking: string | null; designId: string | null; createdAt: Date; paidAt: Date | null }> = [];
  let migrationNeeded = false;
  let paging = pageWindow(page, 0, PAGE_SIZE);
  if (store) {
    try {
      paging = pageWindow(page, await db.printOrder.count({ where: { storeId: store.id } }), PAGE_SIZE);
      if (paging.total) orders = await db.printOrder.findMany({ where: { storeId: store.id }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: paging.skip, take: paging.take, select: { id: true, title: true, previewUrl: true, quantity: true, material: true, finish: true, total: true, days: true, status: true, tracking: true, designId: true, createdAt: true, paidAt: true } });
    } catch (error) {
      if (!isMissingTable(error)) throw error;
      migrationNeeded = true;
    }
  }
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("orders.title")} sub={t("orders.sub")} actions={<PillLink href="/home/labels/packaging" icon="package">{t("hub.packaging")}</PillLink>}>
      <div className="grid gap-4">
        <PageTip>{tipT("labels.orders")}</PageTip>
        {paid === "paid" ? <Notice tone="success">{t("orders.paid")}</Notice> : paid === "pending" ? <Notice tone="info">{t("orders.pending")}</Notice> : paid === "failed" ? <Notice tone="error">{t("orders.failed")}</Notice> : null}
        {migrationNeeded ? <Notice tone="info">{t("hub.migration")}</Notice> : null}
        {orders.length ? (
          <>
          {orders.map((order) => (
            <article key={order.id} className="flex flex-wrap items-center gap-4 rounded-[20px] border border-app-line bg-white p-4">
              <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-[12px] bg-app-canvas">
                {order.previewUrl ? <img src={order.previewUrl} alt="" className="max-h-full max-w-full object-contain" /> : <Icon name="package" size={20} />}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 text-[15px] font-extrabold">{order.title}</p>
                <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">
                  {order.quantity.toLocaleString("en-NG")} · {order.material} · {order.finish} · ₦{order.total.toLocaleString("en-NG")}
                </p>
                <p className="m-0 mt-0.5 text-[12.5px] text-app-ink-soft">
                  {order.paidAt ? t("orders.paidOn", { date: order.paidAt.toLocaleDateString("en-NG"), days: order.days }) : t("orders.notPaid")}
                  {order.tracking ? ` · ${t("orders.tracking")}: ${order.tracking}` : ""}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${STATUS_TONE[order.status] ?? ""}`}>{t.dynamic(`ostatus.${order.status}`, PRINT_ORDER_STATUS_LABEL[order.status as PrintOrderStatus] ?? order.status)}</span>
                {order.designId ? <Link href={`/home/labels/order?design=${order.designId}`} className="text-[13px] font-bold text-app-accent">{t("orders.again")}</Link> : null}
              </div>
            </article>
          ))}
          <Pagination {...paging} base="/home/labels/orders" label={t("orders.pages")} className="" />
          </>
        ) : (
          <div className="rounded-[18px] border border-dashed border-app-line bg-white p-6 text-center text-[14px] text-app-ink-soft">{t("orders.empty")}</div>
        )}
      </div>
    </SellerPage>
  );
}
