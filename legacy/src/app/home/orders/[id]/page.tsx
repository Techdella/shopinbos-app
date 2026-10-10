import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AppFrame } from "@/components/shell/AppFrame";
import { TopBar } from "@/components/shell/TopBar";
import { Btn } from "@/components/ui/Btn";
import { Card } from "@/components/ui/Card";

import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { FulfillmentPanel } from "./FulfillmentPanel";

export default async function OrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true },
  });
  if (!store) notFound();

  const order = await db.retailOrder.findFirst({ where: { id, storeId: store.id } });
  if (!order) notFound();

  const items = order.items as any[];
  const address = order.deliveryAddress as any;

  return (
    <AppFrame role="seller" chipMode="rail" chipRole="seller">
      <TopBar
        eyebrow="ORDER DETAIL"
        title={order.orderNumber}
        subtitle={`Placed by ${order.buyerName} · ${new Date(order.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "long", year: "numeric" })}`}
        actions={
          <Link href="/home/orders" className="no-underline">
            <Btn variant="ghost" size="sm">← Back to orders</Btn>
          </Link>
        }
      />

      <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-6">
        <div className="grid gap-6 xl:grid-cols-[1.3fr_360px]">
          <div className="flex flex-col gap-4">
            {/* Items */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Items</div>
              {items.map((item: any, idx: number) => (
                <div key={idx} className="flex items-center gap-3 py-3 border-b last:border-b-0" style={{ borderColor: "rgb(14 42 56 / 0.06)" }}>
                  <div className="h-12 w-12 rounded-[12px] bg-[var(--color-cream)] overflow-hidden flex-shrink-0">
                    {item.image ? <Image src={item.image} alt={item.name} fill className="object-cover" unoptimized /> : <div className="h-full w-full flex items-center justify-center text-lg">🛍️</div>}
                  </div>
                  <div className="flex-1">
                    <div className="font-semibold text-[var(--color-navy)]">{item.name}</div>
                    <div className="text-[12px] text-[var(--color-muted)]">Qty: {item.quantity} · {store.currency} {item.price.toLocaleString()} each</div>
                  </div>
                  <div className="font-semibold text-[var(--color-navy)]">{store.currency} {(item.price * item.quantity).toLocaleString()}</div>
                </div>
              ))}
            </Card>

            {/* Customer */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Customer</div>
              <div className="grid gap-1 text-[14px]">
                <div><span className="text-[var(--color-muted)]">Name: </span><span className="font-semibold text-[var(--color-navy)]">{order.buyerName}</span></div>
                <div><span className="text-[var(--color-muted)]">Email: </span><a href={`mailto:${order.buyerEmail}`} className="text-[var(--color-teal-deep)]">{order.buyerEmail}</a></div>
                {order.buyerPhone && <div><span className="text-[var(--color-muted)]">Phone: </span><span className="text-[var(--color-navy)]">{order.buyerPhone}</span></div>}
              </div>
              {address && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--color-muted)] mb-2">Delivery Address</div>
                  <div className="text-[14px] text-[var(--color-navy)]">
                    {[address.street, address.city, address.state, address.country].filter(Boolean).join(", ")}
                  </div>
                </div>
              )}
              {order.notes && (
                <div className="mt-4 pt-4 border-t" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  <div className="font-mono text-[10px] tracking-[0.14em] uppercase text-[var(--color-muted)] mb-2">Notes</div>
                  <div className="text-[14px] text-[var(--color-muted)]">{order.notes}</div>
                </div>
              )}
            </Card>
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-4">
            {/* Totals */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Payment</div>
              <div className="flex flex-col gap-2 text-[14px]">
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Subtotal</span><span>{store.currency} {Number(order.subtotal).toLocaleString()}</span></div>
                <div className="flex justify-between"><span className="text-[var(--color-muted)]">Shipping</span><span>{Number(order.shippingFee) === 0 ? "Free" : `${store.currency} ${Number(order.shippingFee).toLocaleString()}`}</span></div>
                <div className="flex justify-between font-bold text-[16px] text-[var(--color-navy)] pt-2 border-t" style={{ borderColor: "rgb(14 42 56 / 0.08)" }}>
                  <span>Total</span><span>{store.currency} {Number(order.total).toLocaleString()}</span>
                </div>
              </div>
              {order.paystackRef && (
                <div className="mt-3 text-[11px] text-[var(--color-muted)]">Ref: {order.paystackRef}</div>
              )}
            </Card>

            {/* Status */}
            <Card>
              <div className="font-mono text-[11px] tracking-[0.16em] uppercase text-[var(--color-teal-deep)] mb-3">Order Status</div>
              <FulfillmentPanel
                orderId={order.id}
                currentStatus={order.status}
                trackingCode={order.trackingCode}
                logisticsDetails={order.logisticsDetails as Record<string, unknown> | null}
              />
            </Card>
          </div>
        </div>
      </div>
    </AppFrame>
  );
}
