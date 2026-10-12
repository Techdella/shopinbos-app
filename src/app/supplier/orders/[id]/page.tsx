import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage, Card, Pill, PillLink, Thumb } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { buttonClass, money, supplierFrame, timeAgo } from "@/components/supplier/supplier-kit";
import { AcceptCountdown } from "@/components/supplier/AcceptCountdown";
import { PickupBooking } from "@/components/supplier/PickupBooking";
import { updateSupplierOrderStatus } from "@/app/actions/supplier";
import { messagesHref } from "@/lib/conversations/pure";
import { listDropshipOrders } from "@/lib/supplier-orders/views.server";
import { pickupState } from "@/lib/supplier-orders/pickup.server";
import { wholesaleRef } from "@/lib/supplier-orders/wholesale.server";
import { SELLER_CANCEL_PREFIX } from "@/lib/supplier-orders/pure";

export const dynamic = "force-dynamic";

// One supplier order as a guided flow (spec 8A): a new order shows "You get ₦X", the countdown to accept and one
// big Accept; then "Pack it with this label" and "I've packed it"; then "When can a rider pick it up?" and the
// rider booking (src/components/supplier/PickupBooking.tsx). ?kind=wholesale for bulk orders.

type PageProps = { params: Promise<{ id: string }>; searchParams?: Promise<{ kind?: string; saved?: string; error?: string }> };

const STAGE: Record<string, { label: string; tone: "accent" | "info" | "warning" | "success" | "muted" | "danger" }> = {
  pending: { label: "New: accept it", tone: "accent" },
  accepted: { label: "To pack", tone: "warning" },
  confirmed: { label: "To pack", tone: "warning" },
  processing: { label: "Packed: rider next", tone: "warning" },
  shipped: { label: "With the rider", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  rejected: { label: "You said no", tone: "muted" },
  cancelled: { label: "Cancelled", tone: "muted" },
  expired: { label: "Time ran out", tone: "danger" },
};

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 text-[15px] leading-relaxed">
      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-app-ink text-[13px] font-extrabold text-white">{n}</span>
      <span>{children}</span>
    </li>
  );
}

export default async function SupplierOrderPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const query = (await searchParams) ?? {};
  const kind = query.kind === "wholesale" ? "wholesale" : "dropship";
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  let view: {
    ref: string; status: string; shop: string; sellerUserId: string; createdAt: string; acceptBy: string | null; youGet: number; currency: string;
    title: string; image: string | null; lines: Array<{ name: string; quantity: number }>; label: null | { to: string; phone: string | null; address: string[]; collect: number };
    sendTo: string | null; notes: string | null; rejectReason: string | null; trackingCode: string | null; mixed: boolean;
  };
  if (kind === "dropship") {
    const { orders } = await listDropshipOrders(supplier.id, { id, take: 1 });
    const order = orders[0];
    if (!order) notFound();
    view = {
      ref: order.ref, status: order.status, shop: order.shop, sellerUserId: order.sellerUserId, createdAt: order.createdAt, acceptBy: order.acceptBy, youGet: order.costTotal, currency: order.currency,
      title: order.items.map((item) => `${item.name}${item.variant && !item.name.includes(item.variant) ? ` (${item.variant})` : ""}${item.quantity > 1 ? ` ×${item.quantity}` : ""}`).join(", "),
      image: order.items[0]?.image ?? null,
      lines: order.items.map((item) => ({ name: item.name, quantity: item.quantity })),
      label: { to: order.recipient.name, phone: order.recipient.phone, address: order.recipient.address, collect: order.collectOnDelivery },
      sendTo: null, notes: order.notes, rejectReason: order.rejectReason, trackingCode: order.trackingCode, mixed: order.otherItemsInOrder,
    };
  } else {
    const order = await db.wholesaleOrder.findFirst({
      where: { id, supplierId: supplier.id },
      include: { seller: { select: { name: true, store: { select: { name: true } } } }, supplierProduct: { select: { name: true, images: true } } },
    });
    if (!order) notFound();
    view = {
      ref: wholesaleRef(order.id), status: order.expiredAt ? "expired" : order.status, shop: order.seller.store?.name ?? order.seller.name, sellerUserId: order.sellerId, createdAt: order.createdAt.toISOString(),
      acceptBy: order.acceptBy?.toISOString() ?? null, youGet: order.totalPrice, currency: order.currency,
      title: `${order.supplierProduct.name} ×${order.quantity.toLocaleString("en-NG")}`, image: order.supplierProduct.images[0] ?? null,
      lines: [{ name: order.supplierProduct.name, quantity: order.quantity }], label: null, sendTo: order.deliveryAddress, notes: order.notes,
      rejectReason: order.expiredAt ? null : order.rejectReason, trackingCode: order.trackingCode, mixed: false,
    };
  }

  const pickup = ["accepted", "confirmed", "processing"].includes(view.status) ? await pickupState(supplier.id, kind, id) : null;
  const stage = pickup?.packed ? STAGE.processing : STAGE[view.status] ?? { label: view.status, tone: "muted" as const };
  const isNew = view.status === "pending";
  const returnTo = `/supplier/orders/${id}`;
  const hidden = (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="orderId" value={id} />
      <input type="hidden" name="returnTo" value={returnTo} />
    </>
  );

  return (
    <AppPage
      frame={supplierFrame(user, supplier, { searchPlaceholder: "Search by seller, product, address…" })}
      title={isNew ? view.title : pickup?.packed ? "Ready for the rider" : pickup ? "Pack it with this label" : view.title}
      sub={`${kind === "dropship" ? "A shop sold it for you" : "Bulk order"} · ${view.shop} · ${view.ref} · ${timeAgo(view.createdAt)}`}
      actions={<PillLink href="/supplier/orders" size="sm" icon="arrowLeft">All orders</PillLink>}
    >
      <div className="mx-auto grid max-w-[720px] gap-4">
        {(query.error || query.saved) && <Notice tone={query.error ? "error" : "success"}>{query.error ?? "Order updated."}</Notice>}

        <Card className="flex items-center gap-4 p-5">
          <Thumb src={view.image} label={view.title} size={64} />
          <div className="min-w-0 flex-1">
            <div className="text-[17px] font-extrabold leading-snug">{view.title}</div>
            <div className="mt-1 flex flex-wrap items-center gap-2"><Pill tone={stage.tone} dot>{stage.label}</Pill></div>
          </div>
          <div className="text-right">
            <div className="text-[13px] text-app-ink-soft">You get</div>
            <div className="text-[24px] font-extrabold text-app-success">{money(view.youGet, view.currency)}</div>
          </div>
        </Card>

        {view.status === "expired" && (
          <Notice tone="error">Time ran out on this order, so the shop was told. Don&apos;t send it. Accept new orders quickly so shops keep sending you work.</Notice>
        )}
        {view.rejectReason && <Notice tone="info">{view.rejectReason.startsWith(SELLER_CANCEL_PREFIX) ? view.rejectReason : `You said no to this order: ${view.rejectReason}`}</Notice>}

        {isNew && (
          <Card className="grid gap-4 p-5">
            <AcceptCountdown acceptBy={view.acceptBy} big />
            <ol className="m-0 grid list-none gap-3 p-0">
              <Step n={1}>Accept the order</Step>
              <Step n={2}>{kind === "dropship" ? <>Pack it with {view.shop}&apos;s label. Don&apos;t put your own name inside.</> : "Pack it and get it ready."}</Step>
              <Step n={3}>A rider comes to collect it at a time you pick. You don&apos;t pay for delivery.</Step>
            </ol>
            <p className="m-0 text-[15px] text-app-ink-soft">The shop pays first. We keep the money safe and send it to you after delivery.</p>
            <form action={updateSupplierOrderStatus}>
              {hidden}
              <input type="hidden" name="action" value="accept" />
              <button type="submit" className={`${buttonClass.ink} min-h-[56px] w-full text-[17px]`}><Icon name="check" size={18} /> Accept order</button>
            </form>
            <details>
              <summary className="min-h-[40px] cursor-pointer list-none py-2 text-center text-[14.5px] font-bold text-app-ink-soft underline underline-offset-4">I can&apos;t do this one</summary>
              <form action={updateSupplierOrderStatus} className="mt-2 grid gap-2">
                {hidden}
                <input type="hidden" name="action" value="reject" />
                <label htmlFor="reason" className="text-[14px] font-bold">Why not? The shop sees this.</label>
                <textarea id="reason" name="reason" required minLength={3} maxLength={500} rows={2} placeholder="Out of stock until next week" className="w-full rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 text-[15px]" />
                <button type="submit" className={buttonClass.smallWhite}>Say no to this order</button>
              </form>
            </details>
          </Card>
        )}

        {pickup && !pickup.packed && view.label && (
          <Card className="grid gap-2 border-2 border-dashed border-app-ink p-5" as="div">
            <div className="text-[24px] font-extrabold">{view.shop}</div>
            <div className="text-[14.5px] text-app-ink-soft">Order {view.ref}</div>
            <hr className="my-1 border-app-line" />
            <div className="text-[14.5px] text-app-ink-soft">To:</div>
            <div className="text-[18px] font-extrabold">{view.label.to}</div>
            {view.label.address.map((line) => <div key={line} className="text-[16px]">{line}</div>)}
            {view.label.phone && <div className="text-[16px] font-bold">{view.label.phone}</div>}
            {view.label.collect > 0 && <div className="text-[16px] font-extrabold text-app-accent-ink">Rider collects {money(view.label.collect, view.currency)}</div>}
          </Card>
        )}
        {pickup && !pickup.packed && (
          <Card className="grid gap-2 p-5">
            <div className="text-[16px] font-extrabold">What goes inside</div>
            {view.lines.map((line, index) => <div key={`${line.name}-${index}`} className="flex justify-between text-[15px]"><span>{line.name}</span><span className="font-extrabold">×{line.quantity}</span></div>)}
            {view.mixed && <div className="text-[14px] text-app-ink-soft">The shop&apos;s order has other things too. Send only these.</div>}
            {view.notes && <div className="text-[14px] text-app-ink-soft">Note: {view.notes}</div>}
            {view.sendTo && <div className="text-[14.5px]"><span className="font-bold">Send to:</span> {view.sendTo}</div>}
            {kind === "dropship" && <p className="m-0 text-[14.5px] text-app-ink-soft">The customer thinks it came from {view.shop}. That&apos;s how the shop keeps buying from you.</p>}
          </Card>
        )}
        {pickup && (
          <Card className="p-5">
            <PickupBooking initial={pickup} shop={view.shop} />
          </Card>
        )}

        {["shipped", "delivered"].includes(view.status) && (
          <Card className="grid gap-1 p-5 text-[15px]">
            <div className="font-extrabold">{view.status === "delivered" ? "Delivered" : "The rider has it"}</div>
            {view.trackingCode && <div className="text-app-ink-soft">Rider&apos;s code: {view.trackingCode}</div>}
          </Card>
        )}

        <PillLink href={messagesHref("supplier", { with: view.sellerUserId })} size="sm" icon="chat">Message {view.shop}</PillLink>
      </div>
    </AppPage>
  );
}
