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

type OrderItem = { name?: string; title?: string; quantity?: number; price?: number; image?: string | null; variant?: string };

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

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true, logoUrl: true },
  });
  if (!store) notFound();

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) notFound();

  const items = (Array.isArray(order.items) ? order.items : []) as OrderItem[];
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
                  {order.paymentMethod && <div>Paid by {PAYMENT_METHOD_LABEL[order.paymentMethod] ?? order.paymentMethod}</div>}
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
