import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppPage, EmptyState, ListCard, ListRow, Pill, PillLink, StatGrid, StatTile } from "@/components/app-kit";
import { Avatar, sellerFrame, timeAgo } from "@/components/seller-core";
import { naira } from "@shared/onboarding";

export const dynamic = "force-dynamic";

const SHOWN = 100;

function lastOrder(date: Date) {
  const text = timeAgo(date);
  return text === "Just now" || text === "Yesterday" ? text.toLowerCase() : /ago$/.test(text) ? text : `on ${text}`;
}

export default async function SellerCustomersPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  const store = workspace?.store;
  const orders = store ? await db.retailOrder.findMany({
    where: { storeId: store.id }, orderBy: { createdAt: "desc" },
    select: { id: true, buyerName: true, buyerEmail: true, buyerPhone: true, total: true, createdAt: true, status: true },
  }) : [];

  const map = new Map<string, { key: string; name: string; email: string; orders: number; total: number; last: Date }>();
  for (const o of orders) {
    // Recorded sales may have no email: fall back to the phone, then the name.
    const key = o.buyerEmail.trim().toLowerCase() || o.buyerPhone?.replace(/\D/g, "") || `name:${o.buyerName.trim().toLowerCase()}`;
    const e = map.get(key) ?? { key, name: o.buyerName, email: o.buyerEmail || o.buyerPhone || "", orders: 0, total: 0, last: o.createdAt };
    e.orders++; e.total += Number(o.total); if (e.last < o.createdAt) e.last = o.createdAt;
    map.set(key, e);
  }
  const customers = [...map.values()].sort((a, b) => b.last.getTime() - a.last.getTime());
  const repeat = customers.filter((c) => c.orders > 1).length;
  const delivered = orders.filter((o) => o.status === "delivered").length;

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title="Customers"
      sub={customers.length > 0 ? `${customers.length} customers · ${repeat} came back to buy again` : "Everyone who has bought from you, from your store or recorded sales."}
    >
      <StatGrid className="mb-5">
        <StatTile tone="card" label="Customers" value={customers.length.toLocaleString("en-NG")} hint="All time" />
        <StatTile tone="card" label="Repeat buyers" value={repeat.toLocaleString("en-NG")} hint="Bought more than once" />
        <StatTile tone="card" label="Orders" value={orders.length.toLocaleString("en-NG")} hint="All time" />
        <StatTile tone="card" label="Delivered" value={delivered.toLocaleString("en-NG")} hint="Orders that arrived" />
      </StatGrid>

      {customers.length === 0 ? (
        <EmptyState icon="users" title="No customers yet" action={<PillLink href="/home/orders/new" tone="ink" icon="plus">Record a sale</PillLink>}>
          When someone buys from your store, or you record a sale, they show up here.
        </EmptyState>
      ) : (
        <>
          <ListCard>
            {customers.slice(0, SHOWN).map((c) => (
              <ListRow key={c.key}>
                <div className="flex w-full min-w-0 items-start gap-3.5 md:items-center md:gap-4">
                  <Avatar name={c.name} size={44} />
                  <div className="grid min-w-0 flex-1 items-center gap-x-5 gap-y-1.5 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_auto] xl:grid-cols-[minmax(0,1.8fr)_100px_110px_minmax(0,0.8fr)_120px]">
                    <div className="min-w-0">
                      <div className="truncate text-[15px] font-extrabold">{c.name}</div>
                      {c.email && <div className="truncate text-[13px] text-app-ink-soft">{c.email}</div>}
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13.5px] xl:contents">
                      <span>
                        {c.orders > 5 ? <Pill tone="accent">VIP</Pill> : c.orders > 1 ? <Pill tone="success">Repeat</Pill> : <Pill tone="info">New</Pill>}
                      </span>
                      <span className="text-app-ink-soft">{c.orders} {c.orders === 1 ? "order" : "orders"}</span>
                      <span className="text-app-ink-soft">Last order {lastOrder(c.last)}</span>
                    </div>
                    <div className="text-[15px] font-extrabold md:text-right">{naira(c.total)}</div>
                  </div>
                </div>
              </ListRow>
            ))}
          </ListCard>
          {customers.length > SHOWN && (
            <p className="mb-0 mt-3 text-[13px] text-app-ink-soft">Showing the {SHOWN} most recent of {customers.length.toLocaleString("en-NG")} customers.</p>
          )}
        </>
      )}
    </AppPage>
  );
}
