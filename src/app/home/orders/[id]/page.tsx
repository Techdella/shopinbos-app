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
import { naira } from "@shared/onboarding";
import { messagesHref } from "@/lib/conversations/pure";
import { Notice } from "@/components/app-ui";
import { cancelAndRefundExpiredOrder } from "./supplier-actions";

type OrderItem = { name?: string; title?: string; quantity?: number; price?: number; image?: string | null; variant?: string; productId?: string };

const SUPPLIER_STAGE: Record<string, { label: string; tone: "accent" | "info" | "warning" | "success" | "muted" | "danger" }> = {
  pending: { label: "Sent to supplier", tone: "accent" },
  accepted: { label: "Supplier is preparing it", tone: "warning" },
  shipped: { label: "Shipped by supplier", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  rejected: { label: "Supplier declined", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Supplier didn't answer in time", tone: "danger" },
};

function formatDate(date: Date) {
  return date.toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" });
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
  const address = addressLines(order.deliveryAddress);
  const logistics = order.logisticsDetails && typeof order.logisticsDetails === "object" && !Array.isArray(order.logisticsDetails)
    ? (order.logisticsDetails as Record<string, unknown>)
    : null;
  const row = orderRow({ ...order, total: Number(order.total) });
  const money = (amount: number) => (store.currency === "NGN" ? naira(amount) : `${store.currency} ${Math.round(amount).toLocaleString("en-NG")}`);
  const channel = order.channel ? CHANNEL_LABEL[order.channel as OrderChannel] ?? order.channel : null;
  const discount = Number(order.discountAmount ?? 0);
  const needsRider = row.stage.label === "Needs a rider";

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={order.orderNumber}
      sub={`Placed by ${order.buyerName} · ${formatDate(order.createdAt)}`}
      actions={
        <>
          <PillLink href="/home/orders" icon="arrowLeft">All orders</PillLink>
          <PillLink href={`/home/labels?orders=${order.id}`} tone="ink" icon="document">Print label</PillLink>
        </>
      }
    >
      {(order.paymentIssue || order.expiredAt) && (
        <div role={order.paymentIssue ? "alert" : undefined} className={`mb-4 rounded-[16px] px-4 py-3 text-[14px] ${order.paymentIssue ? "bg-app-danger-tint font-bold text-app-danger" : "bg-app-canvas text-app-ink-soft"}`}>
          {order.paymentIssue ??
            (order.refundStatus && order.refundStatus !== "manual"
              ? `The payment came in after this order expired and its stock had sold, so it was refunded through Paystack${order.refundStatus === "processed" ? "" : " (Paystack is still processing it)"}.`
              : `This order expired unpaid on ${formatDate(order.expiredAt!)} and its stock went back on sale. If the buyer pays now it's taken again, if there's still stock.`)}
        </div>
      )}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <StageDot tone={row.stage.tone}>{row.stage.label}</StageDot>
        <Pill tone={row.payment.tone}>{row.payment.label}</Pill>
        {channel && <span className="text-[13.5px] text-app-ink-soft">From {channel}</span>}
      </div>

      <SplitLayout
        main={
          <>
            {/* Items */}
            <Card className="p-5">
              <CardHead title="Items" sub={`${items.length} ${items.length === 1 ? "item" : "items"}`} />
              {items.length === 0 ? (
                <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">No items were saved on this order.</p>
              ) : (
                <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                  {items.map((item, index) => {
                    const name = String(item.name ?? item.title ?? "Item");
                    const quantity = Number(item.quantity ?? 1) || 1;
                    const price = Number(item.price ?? 0) || 0;
                    return (
                      <li key={index} className="flex items-center gap-3 py-3">
                        <Thumb src={item.image} label={name} />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[15px] font-bold">{name}</div>
                          <div className="text-[13px] text-app-ink-soft">
                            {item.variant ? `${item.variant} · ` : ""}
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

            {supplierOrders.length > 0 && (
              <div id="supplier-orders" className="scroll-mt-24"><Card className="p-5">
                {(flash.saved || flash.error) && (
                  <div className="mb-3">
                    <Notice tone={flash.error ? "error" : "success"}>{flash.error ?? flash.saved}</Notice>
                  </div>
                )}
                <CardHead title="Sent by the supplier" sub="Products you sell without stock go straight from the supplier to your customer, in your shop's name." />
                <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                  {supplierOrders.map((supplierOrder) => {
                    const stage = SUPPLIER_STAGE[supplierOrder.status] ?? { label: supplierOrder.status, tone: "muted" as const };
                    const lines = (Array.isArray(supplierOrder.items) ? supplierOrder.items : []) as Array<{ name?: string; quantity?: number }>;
                    return (
                      <li key={supplierOrder.id} className="grid gap-1.5 py-3 text-[14px]">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="font-bold">{supplierOrder.supplier.displayName}</span>
                          <Pill tone={stage.tone} dot>{stage.label}</Pill>
                        </div>
                        <div className="text-[13px] text-app-ink-soft">{lines.map((line) => `${line.name ?? "Item"} × ${line.quantity ?? 1}`).join(", ")}</div>
                        {supplierOrder.trackingCode && (
                          <div className="text-[13px]">Tracking <span className="font-bold">{supplierOrder.trackingCode}</span>{supplierOrder.carrier ? ` · ${supplierOrder.carrier}` : ""}{supplierOrder.shippedAt ? ` · shipped ${formatDate(supplierOrder.shippedAt)}` : ""}</div>
                        )}
                        {supplierOrder.rejectReason && <div className="text-[13px] font-bold text-app-danger">Declined: {supplierOrder.rejectReason}. Contact your buyer, then refund or replace these items.</div>}
                        {supplierOrder.status === "expired" && (
                          <div className="grid gap-2 rounded-[14px] bg-app-canvas p-3 text-[13.5px]">
                            <div className="font-bold">{supplierOrder.supplier.displayName} didn&apos;t accept this in time, so we took it back from them. Your customer hasn&apos;t been told. What do you want to do?</div>
                            <div className="flex flex-wrap gap-2">
                              <PillLink href={`/marketplace?q=${encodeURIComponent(String(lines[0]?.name ?? "").slice(0, 60))}`} size="sm" icon="search">Find another supplier</PillLink>
                              {!["shipped", "delivered", "cancelled", "refunded", "returned"].includes(order.status) && (
                                <form action={cancelAndRefundExpiredOrder}>
                                  <input type="hidden" name="orderId" value={order.id} />
                                  <button type="submit" className="min-h-[36px] rounded-full border border-app-line bg-white px-4 text-[13px] font-bold">Cancel and refund the customer</button>
                                </form>
                              )}
                            </div>
                          </div>
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
                <CardHead title="Customer" />
                <dl className="m-0 mt-3 grid gap-2.5 text-[14px]">
                  <div>
                    <dt className="text-[12.5px] text-app-ink-soft">Name</dt>
                    <dd className="m-0 font-bold">{order.buyerName}</dd>
                  </div>
                  {order.buyerEmail && (
                    <div className="min-w-0">
                      <dt className="text-[12.5px] text-app-ink-soft">Email</dt>
                      <dd className="m-0 break-all">
                        <a href={`mailto:${order.buyerEmail}`} className="font-bold text-app-accent-ink no-underline hover:underline">{order.buyerEmail}</a>
                      </dd>
                    </div>
                  )}
                  {order.buyerPhone && (
                    <div>
                      <dt className="text-[12.5px] text-app-ink-soft">Phone</dt>
                      <dd className="m-0">
                        <a href={`tel:${order.buyerPhone}`} className="font-bold text-app-ink no-underline hover:underline">{order.buyerPhone}</a>
                      </dd>
                    </div>
                  )}
                </dl>
                {order.notes && (
                  <div className="mt-4 rounded-[14px] bg-app-canvas px-4 py-3">
                    <div className="text-[12.5px] text-app-ink-soft">Note</div>
                    <p className="m-0 mt-0.5 whitespace-pre-line text-[14px]">{order.notes}</p>
                  </div>
                )}
              </Card>

              {/* Delivery */}
              <Card className="p-5">
                <CardHead title="Delivery" />
                <div className="mt-3 grid gap-3 text-[14px]">
                  {address.length > 0 ? (
                    <address className="not-italic leading-[1.5]">
                      {address.map((lineText) => <div key={lineText}>{lineText}</div>)}
                    </address>
                  ) : (
                    <p className="m-0 text-app-ink-soft">No delivery address on this order.</p>
                  )}
                  {logistics?.type ? (
                    <div className="text-app-ink-soft">
                      {logistics.type === "pickup" ? "Buyer pickup" : logistics.type === "network" ? "Delivery partner" : "Personal logistics"}
                    </div>
                  ) : null}
                  {booking && (
                    <div className="grid gap-1">
                      <div className="text-[12.5px] text-app-ink-soft">{booking.logisticsPartner.displayName}</div>
                      <div className="font-bold">
                        {booking.rider ? `${booking.rider.name} · ` : ""}{booking.status === "pending" ? "Waiting for the partner to accept" : booking.status.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase())}
                      </div>
                      {booking.deliveryCode && !["delivered", "failed"].includes(booking.status) && (
                        <div className="mt-1 rounded-[14px] bg-app-mint px-3.5 py-2.5">
                          <div className="text-[12.5px] text-app-forest">Share this code with your buyer</div>
                          <div className="font-mono text-[22px] font-extrabold tracking-[0.2em]">{booking.deliveryCode}</div>
                          <div className="text-[12.5px] text-app-forest">The rider asks for it at the door before handing over the parcel.</div>
                        </div>
                      )}
                    </div>
                  )}
                  {order.trackingCode && (
                    <div>
                      <div className="text-[12.5px] text-app-ink-soft">Tracking code</div>
                      <div className="break-all font-bold">{order.trackingCode}</div>
                    </div>
                  )}
                  {(order.shippedAt || order.deliveredAt) && (
                    <div className="text-[13px] text-app-ink-soft">
                      {order.shippedAt && <div>Shipped {formatDate(order.shippedAt)}</div>}
                      {order.deliveredAt && <div>Delivered {formatDate(order.deliveredAt)}</div>}
                    </div>
                  )}
                  {needsRider && (
                    <div>
                      <PillLink href="/home/logistics" size="sm" icon="truck">Find a delivery partner</PillLink>
                    </div>
                  )}
                  {(booking || orderSuppliers.length > 0) && (
                    <div className="flex flex-wrap gap-2">
                      {booking && (
                        <PillLink href={messagesHref("seller", { with: booking.logisticsPartner.id, context: { kind: "booking", id: booking.id } })} size="sm" icon="chat">
                          Message delivery partner
                        </PillLink>
                      )}
                      {orderSuppliers.map((supplier) => (
                        <PillLink key={supplier.id} href={messagesHref("seller", { with: supplier.id, context: { kind: "order", id: order.id } })} size="sm" icon="chat">
                          Message {orderSuppliers.length > 1 ? supplier.displayName : "supplier"}
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
              <CardHead title="Payment" action={<Pill tone={row.payment.tone}>{row.payment.label}</Pill>} />
              <div className="mt-4 grid gap-2.5">
                <Line label="Subtotal">{money(Number(order.subtotal))}</Line>
                <Line label="Delivery">{Number(order.shippingFee) === 0 ? "Free" : money(Number(order.shippingFee))}</Line>
                {discount > 0 && <Line label={order.discountCode ? `Discount (${order.discountCode})` : "Discount"}>−{money(discount)}</Line>}
                <Line label="Total" strong>{money(Number(order.total))}</Line>
              </div>
              {(order.paymentMethod || channel || order.paystackRef) && (
                <div className="mt-4 grid gap-1 text-[13px] text-app-ink-soft">
                  {order.paymentMethod && <div>{row.payment.label === "Paid" ? "Paid by" : "Paying by"} {PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}</div>}
                  {channel && <div>Sold on {channel}</div>}
                  {order.paystackRef && <div className="break-all">Ref: {order.paystackRef}</div>}
                </div>
              )}
            </Card>

            {/* Status and actions */}
            <Card className="p-5">
              <CardHead title="Status" />
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
