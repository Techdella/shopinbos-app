import Link from "next/link";
import { notFound } from "next/navigation";
import { AppPage, Card, CardHead, Pill, PillLink, SplitLayout, StageDot, Thumb } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";

import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { orderRow } from "@/lib/dashboard/compute";
import { addressLines } from "@/lib/labels";
import { FulfillmentPanel } from "./FulfillmentPanel";
import { CHANNEL_LABEL, type OrderChannel } from "@shared/channels";
import { PAYMENT_METHOD_LABEL } from "@shared/sales";
import { formatDate as formatLocaleDate, formatMoney, formatNumber, type Locale } from "@shared/i18n";
import { getLocale, getT } from "@/lib/i18n/server";
import { messagesHref } from "@/lib/conversations/pure";
import { customerKey } from "@/lib/customers/pure";
import { Notice } from "@/components/app-ui";
import { cancelAndRefundExpiredOrder, undoSupplierSwitchAction } from "./supplier-actions";
import { sellerPartsView } from "@/lib/supplier-orders/parts.server";

type OrderItem = { name?: string; title?: string; quantity?: number; price?: number; image?: string | null; variant?: string; productId?: string };

/** Each parcel's state (shared/order-parts.ts). */
const PART_TONE: Record<string, "accent" | "info" | "warning" | "success" | "muted" | "danger"> = {
  waiting: "accent",
  preparing: "warning",
  sent: "info",
  delivered: "success",
  problem: "danger",
};

function formatDate(date: Date, locale: Locale) {
  return formatLocaleDate(date, locale, { day: "numeric", month: "long", year: "numeric" });
}

function Line({ label, children, strong = false }: { label: string; children: React.ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? "flex justify-between gap-3 border-t border-app-line pt-3 text-[17px] font-extrabold" : "flex justify-between gap-3 text-[14px]"}>
      <span className={strong ? "" : "text-app-ink-soft"}>{label}</span>
      <span className="text-right">{children}</span>
    </div>
  );
}

export default async function OrderDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ saved?: string; error?: string }> }) {
  const { id } = await params;
  const flash = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const t = await getT("orders", "common");
  const locale = await getLocale();
  const naira = (amount: number) => formatMoney(Math.round(amount), locale);

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true, logoUrl: true },
  });
  if (!store) notFound();

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) notFound();
  const booking = await db.deliveryBooking.findFirst({
    where: { orderId: order.id, sellerId: user.id, status: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true, deliveryCode: true, rider: { select: { name: true } }, logisticsPartner: { select: { id: true, displayName: true } } },
  });

  const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
  // Suppliers behind the products on this order (dropshipped or bought wholesale), to message about it.
  const itemProductIds = [...new Set(items.map((item) => item.productId).filter((value): value is string => typeof value === "string"))];
  const orderSuppliers = itemProductIds.length
    ? await db.storeProduct
        .findMany({
          where: { storeId: store.id, id: { in: itemProductIds }, supplierProductId: { not: null } },
          select: { supplierProduct: { select: { supplier: { select: { id: true, displayName: true } } } } },
        })
        .then((rows) => [...new Map(rows.flatMap((row) => (row.supplierProduct ? [[row.supplierProduct.supplier.id, row.supplierProduct.supplier] as const] : []))).values()])
        .catch(() => [])
    : [];
  // Dropship items: what each supplier is doing with them (src/lib/supplier-orders).
  const supplierOrders = await db.supplierOrder
    .findMany({
      where: { retailOrderId: order.id, storeId: store.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, status: true, items: true, trackingCode: true, carrier: true, rejectReason: true, shippedAt: true, deliveredAt: true, supplier: { select: { id: true, displayName: true } } },
    })
    .catch(() => []);
  // Parcels: "2 of 3 parcels sent", each part's state, and anything to decide (a supplier didn't accept in time).
  const parts = supplierOrders.length ? await sellerPartsView(order.id, store.id).catch(() => null) : null;
  const address = addressLines(order.deliveryAddress);
  const logistics = order.logisticsDetails && typeof order.logisticsDetails === "object" && !Array.isArray(order.logisticsDetails)
    ? (order.logisticsDetails as Record<string, unknown>)
    : null;
  const baseRow = orderRow({ ...order, total: Number(order.total) });
  // Suppliers send it: "Waiting for the supplier" / "1 of 2 parcels sent" / "Needs you", not "Needs a rider".
  const row = parts?.stage ? { ...baseRow, stage: parts.stage } : baseRow;
  const money = (amount: number) => (store.currency === "NGN" ? naira(amount) : `${store.currency} ${formatNumber(Math.round(amount), locale)}`);
  const channelLabel = order.channel ? CHANNEL_LABEL[order.channel as OrderChannel] ?? order.channel : null;
  const channel = channelLabel ? t.dynamic(`channel.${channelLabel}`, channelLabel) : null;
  const stageLabel = t.dynamic(`stage.${row.stage.label}`, row.stage.label);
  const paymentLabel = t.dynamic(`pay.${row.payment.label}`, row.payment.label);
  const discount = Number(order.discountAmount ?? 0);
  const needsRider = row.stage.label === "Needs a rider";

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={order.orderNumber}
      sub={t("detail.placedBy", { name: order.buyerName, date: formatDate(order.createdAt, locale) })}
      actions={
        <>
          <PillLink href="/home/orders" icon="arrowLeft">{t("allOrders")}</PillLink>
          <PillLink href={`/home/labels?orders=${order.id}`} tone="ink" icon="document">{t("detail.printLabel")}</PillLink>
        </>
      }
    >
      {(order.paymentIssue || order.expiredAt) && (
        <div role={order.paymentIssue ? "alert" : undefined} className={`mb-4 rounded-[16px] px-4 py-3 text-[14px] ${order.paymentIssue ? "bg-app-danger-tint font-bold text-app-danger" : "bg-app-canvas text-app-ink-soft"}`}>
          {order.paymentIssue ??
            (order.refundStatus && order.refundStatus !== "manual"
              ? order.refundStatus === "processed" ? t("detail.refundedAfterExpiry") : t("detail.refundingAfterExpiry")
              : t("detail.expiredUnpaid", { date: formatDate(order.expiredAt!, locale) }))}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StageDot tone={row.stage.tone}>{stageLabel}</StageDot>
        {parts?.line && parts.line !== row.stage.label && <Pill tone={parts.sent === parts.total ? "success" : "info"}>{parts.line}</Pill>}
        <Pill tone={row.payment.tone}>{paymentLabel}</Pill>
        {channel && <span className="text-[13.5px] text-app-ink-soft">{t("detail.from", { channel })}</span>}
      </div>

      <SplitLayout
        main={
          <>
            {/* Items */}
            <Card className="p-5">
              <CardHead title={t("detail.items")} sub={t("detail.itemCount", { count: items.length })} />
              {items.length === 0 ? (
                <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("detail.noItems")}</p>
              ) : (
                <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                  {items.map((item, index) => {
                    const name = String(item.name ?? item.title ?? t("detail.item"));
                    const quantity = Number(item.quantity ?? 1) || 1;
                    const price = Number(item.price ?? 0) || 0;
                    return (
                      <li key={index} className="flex items-center gap-3 py-3">
                        <Thumb src={item.image} label={name} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-bold">{name}</div>
                          <div className="text-[13px] text-app-ink-soft">
                            {/* Newer orders name the size / colour in the item name ("Ankara dress · L / Red"). */}
                            {item.variant && !name.includes(item.variant) ? `${item.variant} · ` : ""}
                            {quantity} × {money(price)}
                          </div>
                        </div>
                        <div className="shrink-0 text-[15px] font-extrabold">{money(price * quantity)}</div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            {parts && (
              <div id="supplier-orders" className="scroll-mt-24"><Card className="p-5">
                {(flash.saved || flash.error) && (
                  <div className="mb-3">
                    <Notice tone={flash.error ? "error" : "success"}>{flash.error ?? flash.saved}</Notice>
                  </div>
                )}
                <CardHead
                  title={parts.total > 1 ? t("detail.parcels") : t("detail.sentBySupplier")}
                  sub={parts.line ?? t("detail.dropshipSub")}
                />
                {parts.problems.map((problem) => (
                  <div key={problem.supplierOrderId} className="mt-3 grid gap-2 rounded-[14px] bg-app-canvas p-3 text-[13.5px]">
                    {problem.switched ? (
                      <>
                        <div className="font-bold">{problem.switched.message}</div>
                        <div className="text-app-ink-soft">{problem.items}</div>
                        {problem.switched.canUndo ? (
                          <form action={undoSupplierSwitchAction} className="flex flex-wrap items-center gap-2">
                            <input type="hidden" name="orderId" value={order.id} />
                            <input type="hidden" name="supplierOrderId" value={problem.switched.toSupplierOrderId} />
                            <span className="text-app-ink-soft">{t("detail.waitingFor", { name: problem.switched.toName })}</span>
                            <button type="submit" className="min-h-[36px] rounded-full border border-app-line bg-white px-4 text-[13px] font-bold">{t("detail.undo")}</button>
                          </form>
                        ) : problem.switched.accepted ? (
                          <div className="text-app-ink-soft">{t("detail.accepted", { name: problem.switched.toName })}</div>
                        ) : null}
                      </>
                    ) : problem.status === "expired" ? (
                      <>
                        <div className="font-bold">
                          {problem.undone ? t("detail.didntAcceptUndone", { supplier: problem.supplierName }) : t("detail.didntAccept", { supplier: problem.supplierName })}
                        </div>
                        <div className="text-app-ink-soft">{problem.items}</div>
                        <div className="flex flex-wrap gap-2">
                          <PillLink href={`/marketplace?q=${encodeURIComponent(problem.searchQuery)}`} size="sm" icon="search">{t("detail.findAnother")}</PillLink>
                          {parts.canCancelAndRefund && (
                            <form action={cancelAndRefundExpiredOrder}>
                              <input type="hidden" name="orderId" value={order.id} />
                              <button type="submit" className="min-h-[36px] rounded-full border border-app-line bg-white px-4 text-[13px] font-bold">{t("detail.cancelRefund")}</button>
                            </form>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="font-bold text-app-danger">{t("detail.cantSend", { supplier: problem.supplierName, items: problem.items })}</div>
                    )}
                  </div>
                ))}
                <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                  {parts.parts.map((part) => {
                    const supplierOrder = part.supplierOrderId ? supplierOrders.find((row) => row.id === part.supplierOrderId) : null;
                    return (
                      <li key={part.key} className="grid gap-1.5 py-3 text-[14px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold">{part.kind === "own" ? t("detail.yourPart") : part.name}</span>
                          <Pill tone={PART_TONE[part.state] ?? "muted"} dot>{part.label}</Pill>
                        </div>
                        <div className="text-[13px] text-app-ink-soft">{part.items}</div>
                        {part.trackingCode && (
                          <div className="text-[13px]">{t("detail.tracking")} <span className="font-bold">{part.trackingCode}</span>{supplierOrder?.carrier ? ` · ${supplierOrder.carrier}` : ""}{supplierOrder?.shippedAt ? ` · ${t("detail.sentOn", { date: formatDate(supplierOrder.shippedAt, locale) })}` : ""}</div>
                        )}
                        {supplierOrder?.rejectReason && <div className="text-[13px] font-bold text-app-danger">{t("detail.declined", { reason: supplierOrder.rejectReason })}</div>}
                        {supplierOrder && ["shipped", "delivered"].includes(supplierOrder.status) && (
                          <Link href={`/home/wallet?claim=supplier_order:${supplierOrder.id}`} className="text-[13px] font-bold text-app-accent-ink no-underline hover:underline">{t("detail.reportProblem")}</Link>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Card></div>
            )}

            <div className="grid gap-5 lg:grid-cols-2">
              {/* Customer */}
              <Card className="p-5">
                <CardHead title={t("detail.customer")} />
                <dl className="m-0 mt-3 grid gap-2.5 text-[14px]">
                  <div>
                    <dt className="text-[12.5px] text-app-ink-soft">{t("detail.name")}</dt>
                    <dd className="m-0 font-bold">{order.buyerName}</dd>
                  </div>
                  {order.buyerEmail && (
                    <div className="min-w-0">
                      <dt className="text-[12.5px] text-app-ink-soft">{t("detail.email")}</dt>
                      <dd className="m-0 break-all">
                        {/* Opens the customer's drawer on the in-app email composer (sent from the seller's connected email). */}
                        <a href={`/home/customers?customer=${encodeURIComponent(customerKey(order))}&compose=email`} className="font-bold text-app-accent-ink no-underline hover:underline">{order.buyerEmail}</a>
                      </dd>
                    </div>
                  )}
                  {order.buyerPhone && (
                    <div>
                      <dt className="text-[12.5px] text-app-ink-soft">{t("detail.phone")}</dt>
                      <dd className="m-0">
                        <a href={`tel:${order.buyerPhone}`} className="font-bold text-app-ink no-underline hover:underline">{order.buyerPhone}</a>
                      </dd>
                    </div>
                  )}
                </dl>
                {order.notes && (
                  <div className="mt-4 rounded-[14px] bg-app-canvas px-4 py-3">
                    <div className="text-[12.5px] text-app-ink-soft">{t("detail.note")}</div>
                    <p className="m-0 mt-0.5 whitespace-pre-line text-[14px]">{order.notes}</p>
                  </div>
                )}
              </Card>

              {/* Delivery */}
              <Card className="p-5">
                <CardHead title={t("detail.delivery")} />
                <div className="mt-3 grid gap-3 text-[14px]">
                  {address.length > 0 ? (
                    <address className="not-italic leading-[1.5]">
                      {address.map((lineText) => <div key={lineText}>{lineText}</div>)}
                    </address>
                  ) : (
                    <p className="m-0 text-app-ink-soft">{t("detail.noAddress")}</p>
                  )}
                  {logistics?.type ? (
                    <div className="text-app-ink-soft">
                      {logistics.type === "pickup" ? t("detail.pickup") : logistics.type === "network" ? t("detail.network") : t("detail.personal")}
                    </div>
                  ) : null}
                  {booking && (
                    <div className="grid gap-1">
                      <div className="text-[12.5px] text-app-ink-soft">{booking.logisticsPartner.displayName}</div>
                      <div className="font-bold">
                        {booking.rider ? `${booking.rider.name} · ` : ""}{booking.status === "pending" ? t("detail.waitingPartner") : t.dynamic(`booking.${booking.status}`, booking.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()))}
                      </div>
                      {booking.deliveryCode && !["delivered", "failed"].includes(booking.status) && (
                        <div className="mt-1 rounded-[14px] bg-app-mint px-3.5 py-2.5">
                          <div className="text-[12.5px] text-app-forest">{t("detail.shareCode")}</div>
                          <div className="font-mono text-[22px] font-extrabold tracking-[0.2em]">{booking.deliveryCode}</div>
                          <div className="text-[12.5px] text-app-forest">{t("detail.codeNote")}</div>
                        </div>
                      )}
                      {["picked_up", "in_transit", "delivered", "failed"].includes(booking.status) && (
                        <Link href={`/home/wallet?claim=booking:${booking.id}`} className="text-[13px] font-bold text-app-accent-ink no-underline hover:underline">{t("detail.reportProblem")}</Link>
                      )}
                    </div>
                  )}
                  {order.trackingCode && (
                    <div>
                      <div className="text-[12.5px] text-app-ink-soft">{t("detail.trackingCode")}</div>
                      <div className="break-all font-bold">{order.trackingCode}</div>
                    </div>
                  )}
                  {(order.shippedAt || order.deliveredAt) && (
                    <div className="text-[13px] text-app-ink-soft">
                      {order.shippedAt && <div>{t("detail.shipped", { date: formatDate(order.shippedAt, locale) })}</div>}
                      {order.deliveredAt && <div>{t("detail.deliveredOn", { date: formatDate(order.deliveredAt, locale) })}</div>}
                    </div>
                  )}
                  {needsRider && (
                    <div>
                      <PillLink href="/home/logistics" size="sm" icon="truck">{t("detail.findPartner")}</PillLink>
                    </div>
                  )}
                  {(booking || orderSuppliers.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {booking && (
                        <PillLink href={messagesHref("seller", { with: booking.logisticsPartner.id, context: { kind: "booking", id: booking.id } })} size="sm" icon="chat">
                          {t("detail.messagePartner")}
                        </PillLink>
                      )}
                      {orderSuppliers.map((supplier) => (
                        <PillLink key={supplier.id} href={messagesHref("seller", { with: supplier.id, context: { kind: "order", id: order.id } })} size="sm" icon="chat">
                          {orderSuppliers.length > 1 ? t("detail.messageName", { name: supplier.displayName }) : t("detail.messageSupplier")}
                        </PillLink>
                      ))}
                    </div>
                  )}
                </div>
              </Card>
            </div>
          </>
        }
        side={
          <>
            {/* Payment */}
            <Card className="p-5">
              <CardHead title={t("detail.payment")} action={<Pill tone={row.payment.tone}>{paymentLabel}</Pill>} />
              <div className="mt-4 grid gap-2.5">
                <Line label={t("detail.subtotal")}>{money(Number(order.subtotal))}</Line>
                <Line label={t("detail.delivery")}>{Number(order.shippingFee) === 0 ? t("detail.free") : money(Number(order.shippingFee))}</Line>
                {discount > 0 && <Line label={order.discountCode ? t("detail.discountCode", { code: order.discountCode }) : t("detail.discount")}>−{money(discount)}</Line>}
                <Line label={t("detail.total")} strong>{money(Number(order.total))}</Line>
              </div>
              {(order.paymentMethod || channel || order.paystackRef) && (
                <div className="mt-4 grid gap-1 text-[13px] text-app-ink-soft">
                  {order.paymentMethod && (() => {
                    const method = t.dynamic(`method.${order.paymentMethod}`, PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod);
                    return <div>{row.payment.label === "Paid" ? t("detail.paidBy", { method }) : t("detail.payingBy", { method })}</div>;
                  })()}
                  {channel && <div>{t("detail.soldOn", { channel })}</div>}
                  {order.paystackRef && <div className="break-all">{t("detail.ref", { ref: order.paystackRef })}</div>}
                </div>
              )}
            </Card>

            {/* Status and actions */}
            <Card className="p-5">
              <CardHead title={t("detail.status")} />
              <div className="mt-3">
                <FulfillmentPanel
                  orderId={order.id}
                  currentStatus={order.status}
                  trackingCode={order.trackingCode}
                  logisticsDetails={logistics}
                />
              </div>
            </Card>
          </>
        }
      />
    </AppPage>
  );
}
