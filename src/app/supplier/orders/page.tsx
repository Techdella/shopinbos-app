import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage, Card, EmptyState, FilterChips, Pill, PillLink, SearchForm, Thumb } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { ORDER_STATUS, buttonClass, money, orderRef, statusOf, supplierFrame, timeAgo } from "@/components/supplier/supplier-kit";
import { updateSupplierOrderStatus } from "@/app/actions/supplier";
import { messagesHref } from "@/lib/conversations/pure";
import { SELLER_CANCEL_PREFIX, wholesaleActions, type SupplierAction } from "@/lib/supplier-orders/pure";
import { listDropshipOrders, type DropshipView } from "@/lib/supplier-orders/views.server";

export const dynamic = "force-dynamic";

// The supplier's orders: dropship orders (shops' store orders they ship in the shop's name, SupplierOrder) and
// wholesale orders (shops buying stock, WholesaleOrder). Accept, ship with a tracking code, mark delivered or
// decline with a reason (src/app/actions/supplier.ts → src/lib/supplier-orders).

// Wholesale statuses still to send; dropship ones are "pending" and "accepted".
const TO_SHIP = ["pending", "confirmed", "processing"] as const;
const DROPSHIP_TO_SHIP = ["pending", "accepted"] as const;

const FILTERS = [
  { key: "to-ship", label: "To ship", wholesale: [...TO_SHIP], dropship: [...DROPSHIP_TO_SHIP] },
  { key: "on-the-way", label: "On the way", wholesale: ["shipped"], dropship: ["shipped"] },
  { key: "delivered", label: "Delivered", wholesale: ["delivered"], dropship: ["delivered"] },
  { key: "closed", label: "Declined and cancelled", wholesale: ["cancelled", "refunded"], dropship: ["rejected", "cancelled"] },
] as const;

const KINDS = [
  { key: undefined, label: "All orders" },
  { key: "dropship", label: "Dropship" },
  { key: "wholesale", label: "Wholesale" },
] as const;

const DROPSHIP_STATUS: Record<string, { label: string; tone: "accent" | "info" | "warning" | "success" | "muted" | "danger" }> = {
  pending: { label: "New: accept it", tone: "accent" },
  accepted: { label: "Accepted: to ship", tone: "warning" },
  shipped: { label: "On the way", tone: "info" },
  delivered: { label: "Delivered", tone: "success" },
  rejected: { label: "Declined", tone: "muted" },
  cancelled: { label: "Cancelled by the shop", tone: "muted" },
};

type Kind = "dropship" | "wholesale";

type PageProps = {
  searchParams?: Promise<{ status?: string; q?: string; kind?: string; saved?: string; error?: string }>;
};

function href(status?: string, q?: string, kind?: string) {
  const params = new URLSearchParams();
  if (kind) params.set("kind", kind);
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/supplier/orders${query ? `?${query}` : ""}`;
}

function OrderActions({ kind, orderId, actions, defaultTracking }: { kind: Kind; orderId: string; actions: SupplierAction[]; defaultTracking: string }) {
  if (!actions.length) return null;
  const hidden = (
    <>
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="orderId" value={orderId} />
    </>
  );
  return (
    <div className="flex flex-wrap items-start gap-2 lg:col-span-3">
      {actions.includes("accept") && (
        <form action={updateSupplierOrderStatus}>
          {hidden}
          <input type="hidden" name="action" value="accept" />
          <button type="submit" className={buttonClass.smallWhite}><Icon name="check" size={14} /> Accept</button>
        </form>
      )}
      {actions.includes("ship") && (
        <form action={updateSupplierOrderStatus} className="flex flex-wrap items-center gap-2">
          {hidden}
          <input type="hidden" name="action" value="ship" />
          <label htmlFor={`tracking-${orderId}`} className="sr-only">Tracking code</label>
          <input
            id={`tracking-${orderId}`}
            name="trackingCode"
            required
            maxLength={80}
            defaultValue={defaultTracking}
            placeholder="Tracking code"
            className="min-h-[40px] w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[13.5px] outline-none focus:border-app-ink sm:w-[200px]"
          />
          <label htmlFor={`carrier-${orderId}`} className="sr-only">Courier (optional)</label>
          <input
            id={`carrier-${orderId}`}
            name="carrier"
            maxLength={60}
            placeholder="Courier (optional)"
            className="min-h-[40px] w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[13.5px] outline-none focus:border-app-ink sm:w-[170px]"
          />
          <button type="submit" className={buttonClass.smallInk}>
            <Icon name="truck" size={14} /> Mark shipped
          </button>
        </form>
      )}
      {actions.includes("deliver") && (
        <form action={updateSupplierOrderStatus}>
          {hidden}
          <input type="hidden" name="action" value="deliver" />
          <button type="submit" className={buttonClass.smallInk}><Icon name="checkCircle" size={14} /> Mark delivered</button>
        </form>
      )}
      {actions.includes("reject") && (
        <details className="group">
          <summary className={`${buttonClass.smallWhite} cursor-pointer list-none`}>
            <Icon name="x" size={14} /> Decline
          </summary>
          <form action={updateSupplierOrderStatus} className="mt-2 grid gap-2 sm:w-[360px]">
            {hidden}
            <input type="hidden" name="action" value="reject" />
            <label htmlFor={`reason-${orderId}`} className="text-[13px] font-bold">Why can&apos;t you fill it? The shop sees this.</label>
            <textarea
              id={`reason-${orderId}`}
              name="reason"
              required
              minLength={3}
              maxLength={500}
              rows={2}
              placeholder="Out of stock until next week"
              className="w-full rounded-[14px] border border-app-line bg-white px-3.5 py-2.5 text-[13.5px] outline-none focus:border-app-ink"
            />
            <button type="submit" className={buttonClass.smallWhite}>Decline order</button>
          </form>
        </details>
      )}
    </div>
  );
}

function DropshipRow({ order }: { order: DropshipView }) {
  const stage = statusOf(DROPSHIP_STATUS, order.status);
  const first = order.items[0];
  const units = order.items.reduce((sum, item) => sum + item.quantity, 0);
  return (
    <li className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-start">
      <div className="flex min-w-0 items-start gap-3">
        <Thumb src={first?.image} label={first?.name ?? "Order"} size={48} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-app-canvas px-2 py-0.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em]">Dropship</span>
            <span className="truncate text-[14.5px] font-extrabold">{units} {units === 1 ? "unit" : "units"} for {order.shop}</span>
          </div>
          <ul className="m-0 mt-1 list-none p-0 text-[13px]">
            {order.items.map((item, index) => (
              <li key={`${item.storeProductId}-${index}`} className="flex justify-between gap-3">
                <span className="min-w-0 truncate">{item.name}{item.variant && !item.name.includes(item.variant) ? ` (${item.variant})` : ""} × {item.quantity}</span>
                <span className="shrink-0 text-app-ink-soft">{money(item.lineCost, order.currency)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-1 truncate text-[12.5px] text-app-ink-soft">
            {order.ref} · shop order {order.orderNumber} · {timeAgo(order.createdAt)}
          </div>
          {order.otherItemsInOrder && <div className="mt-1 text-[12.5px] text-app-ink-soft">The shop&apos;s order has other products too. Send only these.</div>}
        </div>
      </div>
      <div className="min-w-0 text-[13px]">
        <div className="font-bold">Ship to {order.recipient.name}</div>
        <div className="flex items-start gap-1.5 text-app-ink-soft">
          <Icon name="pin" size={14} className="mt-0.5 shrink-0" />
          <span>{order.recipient.address.length ? order.recipient.address.join(", ") : "No delivery address. Message the shop."}</span>
        </div>
        {order.recipient.phone && <div className="mt-0.5 text-app-ink-soft"><a href={`tel:${order.recipient.phone}`} className="text-app-ink no-underline hover:underline">{order.recipient.phone}</a></div>}
        <div className="mt-1 text-app-ink-soft">Send it as {order.shop}&apos;s parcel: no invoice or branding of your own.</div>
        {order.collectOnDelivery > 0 && <div className="mt-1 font-bold text-app-accent-ink">Pay on delivery: the rider collects {money(order.collectOnDelivery, order.currency)} from the buyer.</div>}
        {order.notes && <div className="mt-1 text-app-ink-soft">Note: {order.notes}</div>}
        {order.trackingCode && <div className="mt-1 truncate text-app-ink-soft">Tracking {order.trackingCode}{order.carrier ? ` · ${order.carrier}` : ""}</div>}
        {order.rejectReason && <div className="mt-1 text-app-ink-soft">You declined: {order.rejectReason}</div>}
      </div>
      <div className="flex flex-wrap items-center gap-2 lg:justify-end">
        <Pill tone={stage.tone} dot>{stage.label}</Pill>
        <PillLink href={messagesHref("supplier", { with: order.sellerUserId })} size="sm" icon="chat">Message shop</PillLink>
        <span className="min-w-[90px] text-right">
          <span className="block text-[11.5px] text-app-ink-soft">You&apos;re owed</span>
          <span className="text-[14.5px] font-extrabold">{money(order.costTotal, order.currency)}</span>
        </span>
      </div>
      <OrderActions kind="dropship" orderId={order.id} actions={order.next} defaultTracking={order.trackingCode ?? ""} />
    </li>
  );
}

export default async function SupplierOrdersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const filter = FILTERS.find((item) => item.key === params.status);
  const kind: Kind | undefined = params.kind === "dropship" || params.kind === "wholesale" ? params.kind : undefined;
  const q = params.q?.trim() || undefined;

  const where: Prisma.WholesaleOrderWhereInput = {
    supplierId: supplier.id,
    ...(filter ? { status: { in: [...filter.wholesale] } } : {}),
    ...(q
      ? {
          OR: [
            { seller: { name: { contains: q, mode: "insensitive" } } },
            { supplierProduct: { name: { contains: q, mode: "insensitive" } } },
            { deliveryAddress: { contains: q, mode: "insensitive" } },
            { trackingCode: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const [orders, dropship, counts, dropshipCounts] = await Promise.all([
    kind === "dropship"
      ? Promise.resolve([])
      : db.wholesaleOrder.findMany({
          where,
          orderBy: { createdAt: "desc" },
          take: 50,
          include: {
            seller: { select: { name: true } },
            supplierProduct: { select: { name: true, images: true } },
          },
        }),
    kind === "wholesale"
      ? Promise.resolve({ orders: [] as DropshipView[], total: 0 })
      : listDropshipOrders(supplier.id, { statuses: filter ? filter.dropship : undefined, q, take: 50 }),
    db.wholesaleOrder.groupBy({ by: ["status"], where: { supplierId: supplier.id }, _count: { _all: true } }),
    db.supplierOrder.groupBy({ by: ["status"], where: { supplierId: supplier.id }, _count: { _all: true } }),
  ]);

  const countRows = (rows: Array<{ status: string; _count: { _all: number } }>, statuses?: readonly string[]) =>
    rows.filter((row) => !statuses || statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const countOf = (item?: (typeof FILTERS)[number]) =>
    (kind === "dropship" ? 0 : countRows(counts, item?.wholesale)) + (kind === "wholesale" ? 0 : countRows(dropshipCounts, item?.dropship));
  const total = countOf();
  const toShip = countOf(FILTERS[0]);
  const onTheWay = countOf(FILTERS[1]);

  // Newest first across both kinds.
  const rows = [
    ...dropship.orders.map((order) => ({ kind: "dropship" as const, at: new Date(order.createdAt).getTime(), order })),
    ...orders.map((order) => ({ kind: "wholesale" as const, at: order.createdAt.getTime(), order })),
  ].sort((a, b) => b.at - a.at);

  return (
    <AppPage
      frame={supplierFrame(user, supplier, { searchPlaceholder: "Search by seller, product, address…" })}
      title="Orders"
      sub={`${toShip} to ship · ${onTheWay} on the way · ${total} in total. Dropship orders go to the shop's buyer in the shop's name; add a tracking code when a parcel leaves your workshop.`}
      toolbar={
        <>
          <FilterChips items={KINDS.map((item) => ({ label: item.label, href: href(filter?.key, q, item.key), active: kind === item.key }))} />
          <FilterChips
            items={[
              { label: "All", href: href(undefined, q, kind), count: total, active: !filter },
              ...FILTERS.map((item) => ({ label: item.label, href: href(item.key, q, kind), count: countOf(item), active: filter?.key === item.key })),
            ]}
          />
          <SearchForm action="/supplier/orders" defaultValue={q} placeholder="Search seller, product or address" keep={{ status: filter?.key, kind }} />
        </>
      }
    >
      {(params.error || params.saved) && (
        <div className="mb-4">
          <Notice tone={params.error ? "error" : "success"}>{params.error ?? "Order updated."}</Notice>
        </div>
      )}

      {rows.length === 0 ? (
        <EmptyState icon="package" title={total === 0 ? "No orders yet" : "No orders match"}>
          {total === 0
            ? "Orders show up here when a shop sells a product you dropship, or buys from you wholesale."
            : "Try another filter or clear the search."}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {rows.map((row) => {
              if (row.kind === "dropship") return <DropshipRow key={`d-${row.order.id}`} order={row.order} />;
              const order = row.order;
              const stage = statusOf(ORDER_STATUS, order.status);
              const canShip = (TO_SHIP as readonly string[]).includes(order.status);
              return (
                <li key={`w-${order.id}`} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb src={order.supplierProduct.images[0]} label={order.supplierProduct.name} size={48} />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-app-canvas px-2 py-0.5 text-[11.5px] font-extrabold uppercase tracking-[0.06em]">Wholesale</span>
                        <span className="truncate text-[14.5px] font-extrabold">{order.supplierProduct.name} × {order.quantity.toLocaleString("en-NG")}</span>
                      </div>
                      <div className="truncate text-[12.5px] text-app-ink-soft">
                        {orderRef(order.id)} · {order.seller.name} · {money(order.unitPrice, order.currency)} each · {timeAgo(order.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 text-[13px]">
                    <div className="flex items-start gap-1.5 text-app-ink-soft">
                      <Icon name="pin" size={14} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{order.deliveryAddress || "No delivery address"}</span>
                    </div>
                    {order.notes && <div className="mt-1 text-app-ink-soft">Note: {order.notes}</div>}
                    {canShip && <div className="mt-1 text-app-ink-soft">No payment is taken on Shopinbos: confirm it, send the seller your invoice, and they pay you directly.</div>}
                    {order.trackingCode && <div className="mt-1 truncate text-app-ink-soft">Tracking {order.trackingCode}</div>}
                    {order.rejectReason && <div className="mt-1 text-app-ink-soft">{order.rejectReason.startsWith(SELLER_CANCEL_PREFIX) ? order.rejectReason : `You declined: ${order.rejectReason}`}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Pill tone={stage.tone} dot>{stage.label}</Pill>
                    <PillLink href={messagesHref("supplier", { with: order.sellerId, context: { kind: "wholesale_order", id: order.id } })} size="sm" icon="chat">Message seller</PillLink>
                    <span className="min-w-[90px] text-right text-[14.5px] font-extrabold">{money(order.totalPrice, order.currency)}</span>
                  </div>
                  <OrderActions kind="wholesale" orderId={order.id} actions={wholesaleActions(order.status)} defaultTracking={order.trackingCode ?? `SIB-${order.id.slice(0, 8).toUpperCase()}`} />
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppPage>
  );
}
