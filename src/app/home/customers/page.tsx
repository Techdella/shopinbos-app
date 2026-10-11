import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }
function Av({ name, size = 36, seed = 0 }: { name: string; size?: number; seed?: number }) {
  const initials = name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const g = [["#D4A574","#6B4A2C"],["#F2C8B4","#D4A574"],["#195754","#0c4a44"],["#E86A4F","#6B4A2C"],["#5b6ad0","#3a4ba6"]][seed % 5];
  return (
    <div style={{ width: size, height: size, borderRadius: "50%", background: `linear-gradient(135deg,${g[0]},${g[1]})`, display: "grid", placeItems: "center", color: "white", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0 }}>
      {initials}
    </div>
  );
}

export default async function SellerCustomersPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  const store = workspace?.store;
  const orders = store ? await db.retailOrder.findMany({
    where: { storeId: store.id }, orderBy: { createdAt: "desc" },
    select: { id: true, buyerName: true, buyerEmail: true, buyerPhone: true, total: true, createdAt: true, status: true },
  }) : [];

  const map = new Map<string, { name: string; email: string; orders: number; total: number; last: Date }>();
  for (const o of orders) {
    // Recorded sales may have no email: fall back to the phone, then the name.
    const key = o.buyerEmail.trim().toLowerCase() || o.buyerPhone?.replace(/\D/g, "") || `name:${o.buyerName.trim().toLowerCase()}`;
    const e = map.get(key) ?? { name: o.buyerName, email: o.buyerEmail || o.buyerPhone || "", orders: 0, total: 0, last: o.createdAt };
    e.orders++; e.total += Number(o.total); if (e.last < o.createdAt) e.last = o.createdAt;
    map.set(key, e);
  }
  const customers = [...map.values()].sort((a, b) => b.last.getTime() - a.last.getTime());

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
          title="Customers"
          sub={`${customers.length} customers · ${customers.filter((c) => c.orders > 1).length} repeat buyers · ${orders.length} orders`}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Customers</div>
            <div className="stat-val">{customers.length}</div>
            <div className="stat-delta delta-up"><Icon name="users" size={12} /><span>lifetime</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Repeat buyers</div>
            <div className="stat-val">{customers.filter((c) => c.orders > 1).length}</div>
            <div className="stat-delta delta-up"><Icon name="refresh" size={12} /><span>returning</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Orders</div>
            <div className="stat-val">{orders.length}</div>
            <div className="stat-delta delta-up"><Icon name="cart" size={12} /><span>total</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Delivered</div>
            <div className="stat-val">{orders.filter((o) => o.status === "delivered").length}</div>
            <div className="stat-delta delta-up"><Icon name="check" size={12} /><span>fulfilled</span></div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Customer</th>
                <th>Orders</th>
                <th>Lifetime value</th>
                <th>Segment</th>
                <th>Last order</th>
              </tr>
            </thead>
            <tbody>
              {customers.slice(0, 30).map((c, i) => (
                <tr key={c.email}>
                  <td>
                    <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                      <Av name={c.name} size={34} seed={i} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{c.name}</div>
                        <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>{c.email}</div>
                      </div>
                    </div>
                  </td>
                  <td><strong>{c.orders}</strong></td>
                  <td className="money" style={{ fontWeight: 600 }}>{fmt(c.total)}</td>
                  <td>
                    {c.orders > 5 ? <Badge variant="berry" dot>VIP</Badge>
                      : c.orders > 1 ? <Badge variant="mint" dot>Repeat</Badge>
                      : <Badge variant="info" dot>New</Badge>}
                  </td>
                  <td style={{ fontSize: 12.5, color: "var(--ink-500)" }}>
                    {new Date(c.last).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr><td colSpan={5} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>No customers yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
