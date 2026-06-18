import Link from "next/link";
import { AppFrame } from "@/components/shell/AppFrame";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";

export const dynamic = "force-dynamic";

function fmtAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.floor(h / 24);
  if (d === 1) return "Yesterday";
  return `${d} days ago`;
}

function fmtMoney(n: number) {
  return "₦" + n.toLocaleString("en-NG");
}

const STATUS_BADGE: Record<string, { cls: string; label: string }> = {
  pending:    { cls: "badge badge-warn",    label: "Pending pay" },
  paid:       { cls: "badge badge-success", label: "Paid" },
  processing: { cls: "badge badge-info",    label: "Processing" },
  shipped:    { cls: "badge badge-info",    label: "Shipped" },
  delivered:  { cls: "badge badge-success", label: "Delivered" },
  cancelled:  { cls: "badge badge-soft",    label: "Cancelled" },
  refunded:   { cls: "badge badge-soft",    label: "Refunded" },
};

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>
}) {
  const { filter = "all" } = await searchParams;
  const user = await requireRole(["seller"], "/login");

  const store = await db.store.findUnique({
    where: { userId: user.id },
    select: { id: true, name: true, currency: true, slug: true, logoUrl: true },
  });

  const orders = store
    ? await db.retailOrder.findMany({
        where: { storeId: store.id },
        orderBy: { createdAt: "desc" },
        take: 50,
      })
    : [];

  const totalRevenue = orders
    .filter(o => ["paid", "processing", "shipped", "delivered"].includes(o.status))
    .reduce((s, o) => s + Number(o.total), 0);

  const needsAction = orders.filter(o => ["pending", "processing"].includes(o.status)).length;
  const shipped     = orders.filter(o => o.status === "shipped").length;
  const delivered   = orders.filter(o => o.status === "delivered").length;

  return (
    <AppFrame
      role="seller"
      storeName={store?.name}
      storeSlug={store?.slug}
      storeInitial={store?.name?.[0]?.toUpperCase()}
      storeLogoUrl={store?.logoUrl}
      userName={user.name ?? "You"}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div className="flex-1 overflow-y-auto" style={{ padding: "24px 28px 40px", background: "var(--canvas)" }}>
        {/* Page header */}
        <div className="pg-hero">
          <div>
            <h1>Orders</h1>
            <div className="pg-sub">
              {orders.length} orders this month · {fmtMoney(totalRevenue)} revenue
            </div>
          </div>
          <div className="pg-acts">
            <Link href="/api/orders/export" className="dbtn dBtn-ghost dBtn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Export
            </Link>
            <button className="dbtn dBtn-ghost dBtn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="14" y2="12"/><line x1="4" y1="18" x2="8" y2="18"/></svg>
              Saved views
            </button>
            <Link href="/home/orders/new" className="dbtn dBtn-mint dBtn-sm">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Manual order
            </Link>
          </div>
        </div>

        {/* Status filter tabs */}
        <div style={{ display: "flex", gap: 6, marginBottom: 16, padding: 5, background: "var(--paper)", border: "1px solid var(--ink-150)", borderRadius: 10, alignSelf: "flex-start", width: "fit-content" }}>
          {[
            { l: "All",          f: "all",          n: orders.length },
            { l: "Needs action", f: "needs_action", n: needsAction,    color: "var(--warning)" },
            { l: "Shipped",      f: "shipped",      n: shipped },
            { l: "Delivered",    f: "delivered",    n: delivered },
          ].map((t, i) => {
            const active = filter === t.f;
            return (
              <Link key={i} href={`/home/orders?filter=${t.f}`}
                style={{
                  padding: "6px 12px", borderRadius: 7, border: "none", fontSize: 12.5, fontWeight: 600, textDecoration: "none",
                  background: active ? "var(--teal-100)" : "transparent",
                  color: active ? "var(--teal-800)" : (t as { l: string; f: string; n: number; color?: string }).color || "var(--ink-700)",
                }}
              >
                {t.l}
                <span style={{ marginLeft: 6, fontFamily: "var(--font-mono)", fontSize: 11, color: active ? "var(--teal-700)" : "var(--ink-400)" }}>{t.n}</span>
              </Link>
            );
          })}
        </div>

        {/* Orders table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          {orders.length === 0 ? (
            <div style={{ padding: 48, textAlign: "center" }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📦</div>
              <div style={{ fontWeight: 600, fontSize: 16, color: "var(--ink-900)", marginBottom: 8 }}>No orders yet</div>
              <div style={{ fontSize: 13, color: "var(--ink-500)" }}>
                Share your store link to start getting customers.
              </div>
            </div>
          ) : (
            <>
              <table className="tbl">
                <thead>
                  <tr>
                    <th>Order</th>
                    <th>Customer</th>
                    <th>Items</th>
                    <th>Total</th>
                    <th>Status</th>
                    <th>Placed</th>
                    <th style={{ width: 80 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {orders.map((order) => {
                    const badge = STATUS_BADGE[order.status] ?? STATUS_BADGE.pending;
                    const itemCount = (order.items as unknown[]).length;
                    return (
                      <tr key={order.id}>
                        <td>
                          <div style={{ fontFamily: "var(--font-mono)", fontWeight: 600, fontSize: 12, color: "var(--teal-700)" }}>{order.orderNumber}</div>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, fontSize: 13 }}>{order.buyerName}</div>
                          <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{order.buyerEmail}</div>
                        </td>
                        <td style={{ fontSize: 12.5, color: "var(--ink-600)" }}>
                          {itemCount} item{itemCount !== 1 ? "s" : ""}
                        </td>
                        <td>
                          <span className="money" style={{ fontWeight: 600 }}>
                            {fmtMoney(Number(order.total))}
                          </span>
                        </td>
                        <td>
                          <span className={badge.cls}>
                            <span className="badge-dot" />
                            {badge.label}
                          </span>
                        </td>
                        <td style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                          {fmtAgo(order.createdAt)}
                        </td>
                        <td>
                          {!["delivered", "cancelled", "refunded"].includes(order.status) && (
                            <Link href={`/home/orders/${order.id}`} style={{ textDecoration: "none" }}>
                              <button className="dbtn dBtn-ghost dBtn-sm" style={{ padding: "4px 10px" }}>View</button>
                            </Link>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ padding: "12px 16px", borderTop: "1px solid var(--ink-100)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontSize: 12, color: "var(--ink-500)" }}>Showing {orders.length} orders</div>
              </div>
            </>
          )}
        </div>
      </div>
    </AppFrame>
  );
}
