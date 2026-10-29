import Link from "next/link";
import { AppPage, Card, EmptyState, FilterChips, Pill, PillLink, Thumb, type Tone } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { sellerFrame } from "@/components/seller-core";
import { PayPreorderButton } from "@/components/seller/PayPreorderButton";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate, formatMoney } from "@shared/i18n";
import type { PreorderStage, StorePreorderStage } from "@shared/preorder";
import { sellerWholesaleRows, storePreorders } from "@/lib/supplier-orders/preorders.server";
import { WHOLESALE_PAY_PREFIX, confirmWholesalePayment } from "@/lib/supplier-orders/wholesale-payments.server";
import { storeBalancePaidAction, storeCancelUnpaidBalanceAction, storeEndPreordersAction, storeStartPreorderAction, storeStockReadyAction } from "@/app/actions/preorders";

export const dynamic = "force-dynamic";

// The seller's preorders (src/lib/supplier-orders/preorders.server.ts), two views:
//   ?view=shop       their store's preorders from shoppers, by product (ship-by date, units, each order); "Stock is
//                    ready" moves the paid orders to processing (the usual status change tells the customer), asks
//                    customers who paid a deposit for the rest ("Balance due": Paid another way, or Cancel once it's
//                    overdue, the deposit then owed back), and can end the preorder too. Unpaid orders are left alone.
//   ?view=suppliers  their bulk preorders from suppliers: stage, deposit paid / balance due, Pay deposit or Pay
//                    balance (Paystack comes back here: the reference is confirmed before it says paid).
// The phone has the same screen (apps/mobile/src/app/preorders.tsx).

const WHOLESALE_TONE: Record<PreorderStage, Tone> = { waiting: "warning", pay_balance: "accent", ready: "success", shipped: "info", delivered: "success", cancelled: "muted" };
const STORE_TONE: Record<StorePreorderStage, Tone> = { unpaid: "muted", waiting: "warning", balance_due: "accent", preparing: "success" };

type PageProps = { searchParams?: Promise<{ view?: string; moved?: string; asked?: string; unpaid?: string; ended?: string; error?: string; notice?: string; reference?: string; trxref?: string }> };

export default async function SellerPreordersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const t = await getT("orders", "common");
  const locale = await getLocale();
  const naira = (kobo: number) => formatMoney(Math.round(kobo / 100), locale);
  const day = (shipsOn: string) => formatDate(new Date(`${shipsOn}T12:00:00Z`), locale, { day: "numeric", month: "short", timeZone: "UTC" });
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });

  // Back from Paystack after Pay deposit / Pay balance: confirm with Paystack before saying it's paid.
  const reference = String(params.reference ?? params.trxref ?? "").slice(0, 60);
  const payment = reference.startsWith(WHOLESALE_PAY_PREFIX) ? await confirmWholesalePayment(reference, user.id).catch(() => null) : null;

  const view = params.view === "suppliers" || payment ? "suppliers" : "shop";
  const [shop, orders] = await Promise.all([
    store ? storePreorders(store.id) : Promise.resolve({ groups: [] }),
    sellerWholesaleRows(user.id, { onlyPreorders: true }),
  ]);
  const fromSuppliers = orders.filter((order) => order.preorder);
  // "Take pre-orders": the store's own products not taking them yet (dropship ones follow their supplier).
  const startable = store && view === "shop"
    ? await db.storeProduct.findMany({ where: { storeId: store.id, preorderEnabled: false, status: { not: "archived" }, fulfillmentType: { not: "dropship" }, inventoryType: { not: "dropshipping" } }, orderBy: { name: "asc" }, take: 300, select: { id: true, name: true } })
    : [];
  const today = new Date().toISOString().slice(0, 10);
  const startCard = startable.length ? (
    <Card id="start" className="mb-4 scroll-mt-24 p-4 sm:p-5">
      <h2 className="m-0 text-[16px] font-extrabold">{t("preorders.start.title")}</h2>
      <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">{t("preorders.start.sub")}</p>
      <form action={storeStartPreorderAction} className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_200px_auto] sm:items-end">
        <label className="grid min-w-0 gap-1 text-[13px] font-bold">
          {t("preorders.start.product")}
          <select name="productId" required defaultValue="" className="h-11 w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[14px] font-normal">
            <option value="" disabled>{t("preorders.start.pick")}</option>
            {startable.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-[13px] font-bold">
          {t("preorders.start.shipsAt")}
          <input type="date" name="shipsAt" min={today} className="h-11 w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[14px] font-normal" />
        </label>
        <button type="submit" className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white">{t("preorders.start.submit")}</button>
      </form>
      <p className="m-0 mt-2 text-[12.5px] text-app-ink-soft">{t("preorders.start.terms")}</p>
    </Card>
  ) : null;

  const notice = params.error
    ? { tone: "error" as const, text: params.error }
    : payment
      ? payment.ok
        ? { tone: "success" as const, text: t("preorders.paidNotice") }
        : { tone: "error" as const, text: payment.error }
      : params.moved !== undefined
        ? { tone: "success" as const, text: [t("preorders.movedDone", { count: params.moved }), Number(params.asked) > 0 ? t("preorders.askedDone", { count: params.asked ?? "0" }) : null, Number(params.unpaid) > 0 ? t("preorders.unpaidLeft", { count: params.unpaid ?? "0" }) : null, params.ended ? t("preorders.endedDone") : null].filter(Boolean).join(" ") }
        : params.ended
          ? { tone: "success" as const, text: t("preorders.endedDone") }
          : params.notice
            ? { tone: "success" as const, text: params.notice.slice(0, 200) }
            : null;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("preorders.title")}
      sub={view === "shop" ? t("preorders.shopSub") : t("preorders.suppliersSub")}
      actions={<PillLink href={view === "shop" ? "/home/orders" : "/marketplace/wholesale"} icon="package">{view === "shop" ? t("preorders.allOrders") : t("preorders.wholesale")}</PillLink>}
      toolbar={
        <FilterChips
          items={[
            { label: t("preorders.viewShop"), href: "/home/preorders?view=shop", count: shop.groups.length, active: view === "shop" },
            { label: t("preorders.viewSuppliers"), href: "/home/preorders?view=suppliers", count: fromSuppliers.filter((order) => order.preorder && !["cancelled", "delivered"].includes(order.preorder.stage)).length, active: view === "suppliers" },
          ]}
        />
      }
    >
      {notice && (
        <div className="mb-4">
          <Notice tone={notice.tone}>{notice.text}</Notice>
        </div>
      )}

      {view === "shop" ? startCard : null}

      {view === "shop" ? (
        shop.groups.length === 0 ? (
          <EmptyState icon="clock" title={t("preorders.shopEmpty")} action={<PillLink href="/products" tone="ink">{t("preorders.toProducts")}</PillLink>}>
            {t("preorders.shopEmptySub")}
          </EmptyState>
        ) : (
          <div className="grid gap-4">
            {shop.groups.map((group) => (
              <Card key={group.productId} id={`p-${group.productId}`} className="scroll-mt-24 p-4 sm:p-5">
                <div className="flex flex-wrap items-start gap-3">
                  <Thumb src={group.image} label={group.name} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/products/${group.productId}#preorder`} className="text-[16px] font-extrabold text-app-ink no-underline hover:underline">{group.name}</Link>
                      {group.product && <Pill tone={group.product.on ? "warning" : "muted"} dot>{group.product.on ? t("preorders.taking") : t("preorders.stopped")}</Pill>}
                    </div>
                    <p className="m-0 mt-1 text-[13.5px] text-app-ink-soft">
                      {[group.shipsOn ? t("preorders.shipBy", { date: day(group.shipsOn) }) : t("preorders.noDate"), t("preorders.orders", { count: group.orders.length }), t("preorders.units", { count: group.units })].join(" · ")}
                    </p>
                    {group.product?.on ? (
                      <p className="m-0 mt-0.5 text-[12.5px] text-app-ink-soft">
                        {[
                          group.product.limit ? t("preorders.takenOf", { taken: group.product.taken, limit: group.product.limit }) : t("preorders.noLimit", { taken: group.product.taken }),
                          group.product.depositPct > 0 ? t("preorders.depositPct", { pct: group.product.depositPct }) : t("preorders.payInFull"),
                        ].join(" · ")}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
                    <PillLink href={`/products/${group.productId}#preorder`} icon="edit">{t("preorders.edit")}</PillLink>
                    {(group.waiting > 0 || group.orders.some((order) => order.stage === "balance_due" && !order.balanceDueOn)) && (
                      <details className="w-full sm:w-auto">
                        <summary className="inline-flex min-h-[44px] cursor-pointer list-none items-center justify-center gap-2 whitespace-nowrap rounded-full bg-app-ink px-5 text-[14px] font-extrabold text-white"><Icon name="checkCircle" size={16} /> {t("preorders.stockReady")}</summary>
                        <form action={storeStockReadyAction} className="mt-2 grid gap-2 rounded-[16px] border border-app-line bg-white p-3 sm:w-[360px]">
                          <input type="hidden" name="productId" value={group.productId} />
                          {group.waiting > 0 && <p className="m-0 text-[13.5px] leading-[1.5]">{t("preorders.shopConfirm", { count: group.waiting, name: group.name })}</p>}
                          {group.orders.some((order) => order.stage === "balance_due" && !order.balanceDueOn) && (
                            <p className="m-0 text-[13.5px] leading-[1.5]">{t("preorders.balanceAskConfirm", { count: group.orders.filter((order) => order.stage === "balance_due" && !order.balanceDueOn).length })}</p>
                          )}
                          {group.unpaid > 0 && <p className="m-0 text-[12.5px] text-app-ink-soft">{t("preorders.unpaidStay", { count: group.unpaid })}</p>}
                          {group.product?.on && (
                            <label className="flex items-center gap-2 text-[13.5px]">
                              <input type="checkbox" name="end" className="h-4 w-4 accent-[#16141F]" /> {t("preorders.endToo")}
                            </label>
                          )}
                          <button type="submit" className="inline-flex min-h-[40px] items-center justify-center whitespace-nowrap rounded-full bg-app-ink px-4 text-[13px] font-extrabold text-white">{t("preorders.confirmYes")}</button>
                        </form>
                      </details>
                    )}
                    {group.product?.on && (
                      <form action={storeEndPreordersAction}>
                        <input type="hidden" name="productId" value={group.productId} />
                        <button type="submit" className="inline-flex min-h-[44px] items-center justify-center whitespace-nowrap rounded-full border border-app-line bg-white px-5 text-[14px] font-extrabold">{t("preorders.end")}</button>
                      </form>
                    )}
                  </div>
                </div>
                {group.orders.length === 0 ? (
                  <p className="m-0 mt-3 rounded-[16px] border border-dashed border-app-line px-3 py-3 text-[13.5px] text-app-ink-soft">{t("preorders.noOrdersYet")}</p>
                ) : null}
                <ul className={`m-0 mt-3 list-none divide-y divide-app-line rounded-[16px] border border-app-line p-0 ${group.orders.length ? "" : "hidden"}`}>
                  {group.orders.map((order) => (
                    <li key={order.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 text-[13.5px]">
                      <span className="min-w-0 flex-1">
                        <span className="font-bold">#{order.orderNumber} · {order.buyerName} · × {order.quantity}</span>
                        <span className="block text-[12.5px] text-app-ink-soft">{t("preorders.orderedOn", { date: formatDate(new Date(order.createdAt), locale, { day: "numeric", month: "short", timeZone: "Africa/Lagos" }) })}</span>
                        {order.stage === "balance_due" && (
                          <span className={`block text-[12.5px] ${order.overdue ? "font-bold text-[#B42318]" : "text-app-ink-soft"}`}>
                            {order.balanceDueOn
                              ? order.overdue
                                ? t("preorders.balanceOverdue", { amount: naira(order.dueKobo), date: day(order.balanceDueOn) })
                                : t("preorders.balanceBy", { amount: naira(order.dueKobo), date: day(order.balanceDueOn) })
                              : t("preorders.balanceOwed", { amount: naira(order.dueKobo) })}
                          </span>
                        )}
                      </span>
                      <Pill tone={order.overdue ? "danger" : STORE_TONE[order.stage]}>{t.dynamic(`preorders.storeStage.${order.stage}`, order.stage)}</Pill>
                      {order.stage === "balance_due" && (
                        <form action={storeBalancePaidAction}>
                          <input type="hidden" name="orderId" value={order.id} />
                          <button type="submit" className="inline-flex min-h-[36px] items-center justify-center whitespace-nowrap rounded-full border border-app-line bg-white px-3.5 text-[12.5px] font-extrabold">{t("preorders.markPaid")}</button>
                        </form>
                      )}
                      {order.overdue && (
                        <details>
                          <summary className="inline-flex min-h-[36px] cursor-pointer list-none items-center justify-center whitespace-nowrap rounded-full border border-[#F3C5BE] bg-white px-3.5 text-[12.5px] font-extrabold text-[#B42318]">{t("preorders.cancelUnpaid")}</summary>
                          <form action={storeCancelUnpaidBalanceAction} className="mt-2 grid gap-2 rounded-[14px] border border-app-line bg-white p-3 sm:w-[320px]">
                            <input type="hidden" name="orderId" value={order.id} />
                            <p className="m-0 text-[13px] leading-[1.5]">{t("preorders.cancelUnpaidConfirm", { number: order.orderNumber })}</p>
                            <button type="submit" className="inline-flex min-h-[38px] items-center justify-center whitespace-nowrap rounded-full bg-[#B42318] px-4 text-[13px] font-extrabold text-white">{t("preorders.cancelUnpaidYes")}</button>
                          </form>
                        </details>
                      )}
                      <PillLink href={`/home/orders/${order.id}`} size="sm" icon="arrow">{t("open")}</PillLink>
                    </li>
                  ))}
                </ul>
              </Card>
            ))}
          </div>
        )
      ) : fromSuppliers.length === 0 ? (
        <EmptyState icon="clock" title={t("preorders.suppliersEmpty")} action={<PillLink href="/marketplace" tone="ink">{t("preorders.findProducts")}</PillLink>}>
          {t("preorders.suppliersEmptySub")}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {fromSuppliers.map((order) => {
              const preorder = order.preorder!;
              const payLabel = order.pay ? (order.pay.step === "deposit" ? t("preorders.payDeposit", { amount: naira(order.pay.kobo) }) : order.pay.step === "balance" ? t("preorders.payBalance", { amount: naira(order.pay.kobo) }) : t("preorders.payAll", { amount: naira(order.pay.kobo) })) : null;
              return (
                <li key={order.id} className="flex flex-wrap items-center gap-3 px-4 py-4 sm:px-5">
                  <Thumb src={order.product.image} label={order.product.name} size={48} />
                  <div className="min-w-0 flex-1">
                    <Link href={`/marketplace/product/${order.product.id}`} className="text-[14.5px] font-extrabold text-app-ink no-underline hover:underline">{order.quantity.toLocaleString("en-NG")} × {order.product.name}</Link>
                    <div className="text-[12.5px] text-app-ink-soft">
                      {[order.supplier.name, preorder.shipsOn ? t("preorders.shipsFrom", { date: day(preorder.shipsOn) }) : t("preorders.shipsSoon"), naira(Math.round(order.totalPrice * 100))].join(" · ")}
                    </div>
                    {preorder.depositKobo > 0 && (
                      <div className="text-[12.5px] text-app-ink-soft">
                        {preorder.dueKobo <= 0 ? t("preorders.paidFull") : preorder.paidKobo > 0 ? t("preorders.depositPaid", { paid: naira(preorder.paidKobo), due: naira(preorder.dueKobo) }) : t("preorders.depositDue", { amount: naira(preorder.depositKobo) })}
                      </div>
                    )}
                  </div>
                  <Pill tone={WHOLESALE_TONE[preorder.stage]} dot>{t.dynamic(`preorders.stage.${preorder.stage}`, preorder.stage)}</Pill>
                  {payLabel && <PayPreorderButton orderId={order.id} label={payLabel} />}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppPage>
  );
}
