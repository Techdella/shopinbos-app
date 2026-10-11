import type { Prisma } from "@prisma/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppPage, Card, EmptyState, FilterChips, Pill, SearchForm, Thumb } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { ORDER_STATUS, buttonClass, money, orderRef, statusOf, supplierFrame, timeAgo } from "@/components/supplier/supplier-kit";
import { updateSupplierOrderStatus } from "@/app/actions/supplier";

export const dynamic = "force-dynamic";

const TO_SHIP = ["pending", "confirmed", "processing"] as const;

const FILTERS = [
  { key: "to-ship", label: "To ship", statuses: [...TO_SHIP] },
  { key: "on-the-way", label: "On the way", statuses: ["shipped"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "closed", label: "Cancelled and refunded", statuses: ["cancelled", "refunded"] },
] as const;

type PageProps = {
  searchParams?: Promise<{ status?: string; q?: string; saved?: string; error?: string }>;
};

function href(status?: string, q?: string) {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/supplier/orders${query ? `?${query}` : ""}`;
}

export default async function SupplierOrdersPage({ searchParams }: PageProps) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const filter = FILTERS.find((item) => item.key === params.status);
  const q = params.q?.trim() || undefined;

  const where: Prisma.WholesaleOrderWhereInput = {
    supplierId: supplier.id,
    ...(filter ? { status: { in: [...filter.statuses] } } : {}),
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

  const [orders, counts] = await Promise.all([
    db.wholesaleOrder.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 50,
      include: {
        seller: { select: { name: true } },
        supplierProduct: { select: { name: true, images: true } },
      },
    }),
    db.wholesaleOrder.groupBy({ by: ["status"], where: { supplierId: supplier.id }, _count: { _all: true } }),
  ]);

  const countOf = (statuses: readonly string[]) => counts.filter((row) => statuses.includes(row.status)).reduce((sum, row) => sum + row._count._all, 0);
  const total = counts.reduce((sum, row) => sum + row._count._all, 0);
  const toShip = countOf(TO_SHIP);
  const onTheWay = countOf(["shipped"]);

  return (
    <AppPage
      frame={supplierFrame(user, supplier, { searchPlaceholder: "Search by seller, product, address…" })}
      title="Orders"
      sub={`${toShip} to ship · ${onTheWay} on the way · ${total} in total. Add a tracking code when a parcel leaves your workshop.`}
      toolbar={
        <>
          <FilterChips
            items={[
              { label: "All", href: href(undefined, q), count: total, active: !filter },
              ...FILTERS.map((item) => ({ label: item.label, href: href(item.key, q), count: countOf(item.statuses), active: filter?.key === item.key })),
            ]}
          />
          <SearchForm action="/supplier/orders" defaultValue={q} placeholder="Search seller, product or address" keep={{ status: filter?.key }} />
        </>
      }
    >
      {(params.error || params.saved) && (
        <div className="mb-4">
          <Notice tone={params.error ? "error" : "success"}>{params.error ?? "Order updated."}</Notice>
        </div>
      )}

      {orders.length === 0 ? (
        <EmptyState icon="package" title={total === 0 ? "No orders yet" : "No orders match"}>
          {total === 0
            ? "Orders show up here when sellers stock your products or buy wholesale."
            : "Try another filter or clear the search."}
        </EmptyState>
      ) : (
        <Card className="overflow-hidden">
          <ul className="m-0 list-none divide-y divide-app-line p-0">
            {orders.map((order) => {
              const stage = statusOf(ORDER_STATUS, order.status);
              const canShip = (TO_SHIP as readonly string[]).includes(order.status);
              return (
                <li key={order.id} className="grid gap-3 px-4 py-4 sm:px-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_auto] lg:items-center">
                  <div className="flex min-w-0 items-center gap-3">
                    <Thumb src={order.supplierProduct.images[0]} label={order.supplierProduct.name} size={48} />
                    <div className="min-w-0">
                      <div className="truncate text-[14.5px] font-extrabold">{order.supplierProduct.name} × {order.quantity.toLocaleString("en-NG")}</div>
                      <div className="truncate text-[12.5px] text-app-ink-soft">
                        {orderRef(order.id)} · {order.seller.name} · {timeAgo(order.createdAt)}
                      </div>
                    </div>
                  </div>
                  <div className="min-w-0 text-[13px]">
                    <div className="flex items-start gap-1.5 text-app-ink-soft">
                      <Icon name="pin" size={14} className="mt-0.5 shrink-0" />
                      <span className="line-clamp-2">{order.deliveryAddress || "No delivery address"}</span>
                    </div>
                    {order.trackingCode && <div className="mt-1 truncate text-app-ink-soft">Tracking {order.trackingCode}</div>}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                    <Pill tone={stage.tone} dot>{stage.label}</Pill>
                    <span className="min-w-[90px] text-right text-[14.5px] font-extrabold">{money(order.totalPrice, order.currency)}</span>
                  </div>
                  {canShip && (
                    <form action={updateSupplierOrderStatus} className="flex flex-wrap items-center gap-2 lg:col-span-3">
                      <input type="hidden" name="orderId" value={order.id} />
                      <input type="hidden" name="status" value="shipped" />
                      <label htmlFor={`tracking-${order.id}`} className="sr-only">Tracking code for {orderRef(order.id)}</label>
                      <input
                        id={`tracking-${order.id}`}
                        name="trackingCode"
                        defaultValue={order.trackingCode ?? `SIB-${order.id.slice(0, 8).toUpperCase()}`}
                        className="min-h-[40px] w-full min-w-0 rounded-full border border-app-line bg-white px-4 text-[13.5px] outline-none focus:border-app-ink sm:w-[240px]"
                      />
                      <button type="submit" className={buttonClass.smallInk}>
                        <Icon name="truck" size={14} /> Mark shipped
                      </button>
                    </form>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}
    </AppPage>
  );
}
