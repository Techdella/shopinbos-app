import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

export default async function SellerPayoutsPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  const store = workspace?.store;
  const paidOrders = store ? await db.retailOrder.findMany({
    where: { storeId: store.id, status: { in: ["paid", "processing", "shipped", "delivered"] } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, orderNumber: true, buyerName: true, total: true, currency: true, status: true, createdAt: true },
  }) : [];

  const gross = paidOrders.reduce((s, o) => s + Number(o.total), 0);

  return (
    <AppFrame
      role="seller"
      storeName={store?.name ?? "Store"}
      storeSlug={store?.slug ?? ""}
      storeInitial={store?.name?.charAt(0).toUpperCase() ?? "S"}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Payouts"
          sub={`${paidOrders.length} eligible orders · ${fmt(gross)} gross eligible`}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Eligible orders</div>
            <div className="stat-val">{paidOrders.length}</div>
            <div className="stat-delta delta-up"><Icon name="cart" size={12} /><span>paid or fulfilled</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Gross eligible</div>
            <div className="stat-val money">{fmt(gross)}</div>
            <div className="stat-delta delta-up"><Icon name="coin" size={12} /><span>total value</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Payout batches</div>
            <div className="stat-val">—</div>
            <div className="stat-delta delta-flat"><Icon name="clock" size={12} /><span>coming next</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Store</div>
            <div className="stat-val" style={{ fontSize: 20 }}>{store?.name ?? "Not created"}</div>
            <div className="stat-delta delta-up"><Icon name="store" size={12} /><span>active</span></div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {paidOrders.slice(0, 30).map((o) => (
                <tr key={o.id}>
                  <td style={{ fontFamily: "var(--font-mono)", fontSize: 12.5, fontWeight: 600 }}>{o.orderNumber}</td>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{o.buyerName}</td>
                  <td className="money" style={{ fontWeight: 600 }}>{fmt(Number(o.total))}</td>
                  <td><Badge variant={o.status === "delivered" ? "mint" : "info"}>{o.status}</Badge></td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                    {new Date(o.createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
              {paidOrders.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No eligible orders yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
