import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { MessageBuyerButton } from "@/components/supplier/MessageBuyerButton";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }

function Av({ name, size = 36, seed = 0, square }: { name: string; size?: number; seed?: number; square?: boolean }) {
  const initials = name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2);
  const gradients = [
    ["#D4A574","#6B4A2C"],["#F2C8B4","#D4A574"],["#195754","#0c4a44"],["#E86A4F","#6B4A2C"],
    ["#5b6ad0","#3a4ba6"],["#8aa843","#5a7a28"],["#b14a8a","#7a2a6a"],["#e8a647","#b97511"],
  ];
  const g = gradients[seed % gradients.length];
  return (
    <div style={{
      width: size, height: size, borderRadius: square ? 7 : "50%",
      background: `linear-gradient(135deg, ${g[0]}, ${g[1]})`,
      display: "grid", placeItems: "center",
      color: "white", fontWeight: 700, fontSize: size * 0.38, flexShrink: 0,
    }}>
      {initials}
    </div>
  );
}

export default async function SupplierBuyersPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const orders = await db.wholesaleOrder.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { seller: { select: { id: true, name: true, city: true, country: true } } },
  });

  const buyerMap = new Map<string, { id: string; name: string; city: string; orders: number; total: number }>();
  for (const o of orders) {
    if (!o.seller) continue;
    const key = o.seller.id;
    const existing = buyerMap.get(key) ?? {
      id: key,
      name: o.seller.name,
      city: `${o.seller.city ?? ""} · ${o.seller.country ?? ""}`,
      orders: 0,
      total: 0,
    };
    existing.orders++;
    existing.total += Number(o.totalPrice);
    buyerMap.set(key, existing);
  }
  const buyers = Array.from(buyerMap.values()).sort((a, b) => b.total - a.total);

  return (
    <AppFrame
      role="supplier"
      storeName={supplier.displayName}
      storeSlug={`${supplier.city ?? "Aba"} · ${supplier.country ?? "Nigeria"}`}
      storeInitial={supplier.displayName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title={`Buyers · ${buyers.length} sellers stock you`}
          sub={`The shops adding your products. Top spender: ${buyers[0]?.name ?? "—"} · ${fmt(buyers[0]?.total ?? 0)} LTV.`}
          actions={<button className="dbtn dBtn-ghost"><Icon name="download" size={14} /> Export</button>}
        />

        {/* Stat tiles */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Active buyers</div>
            <div className="stat-val">{buyers.length}</div>
            <div className="stat-delta delta-up">
              <Icon name="users" size={12} />
              <span>+{Math.round(buyers.length * 0.08)} new this month</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">VIPs (&gt;₦1M LTV)</div>
            <div className="stat-val">{buyers.filter((b) => b.total > 1_000_000).length}</div>
            <div className="stat-delta delta-up">
              <Icon name="star" size={12} />
              <span>+2 promoted</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Repeat orders</div>
            <div className="stat-val">{buyers.length > 1 ? Math.round(buyers.filter((b) => b.orders > 1).length / buyers.length * 100) : 0}%</div>
            <div className="stat-delta delta-up">
              <Icon name="refresh" size={12} />
              <span>industry avg 41%</span>
            </div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Avg order value</div>
            <div className="stat-val money">{fmt(orders.length > 0 ? orders.reduce((s, o) => s + Number(o.totalPrice), 0) / orders.length : 0)}</div>
            <div className="stat-delta delta-up">
              <Icon name="coin" size={12} />
              <span>per order</span>
            </div>
          </div>
        </div>

        {/* Filter */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="sb-search" style={{ flex: "1 1 240px", maxWidth: 380 }}>
            <Icon name="search" size={14} />
            <span style={{ color: "var(--ink-400)" }}>Search buyers…</span>
          </div>
          <div className="sel" style={{ minWidth: 120, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-500)" }}>Segment: All</span>
            <Icon name="chevDown" size={12} />
          </div>
          <div className="sel" style={{ minWidth: 130, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-500)" }}>Country: Any</span>
            <Icon name="chevDown" size={12} />
          </div>
          <div className="sel" style={{ minWidth: 120, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-500)" }}>Activity: Active</span>
            <Icon name="chevDown" size={12} />
          </div>
        </div>

        {/* Buyers table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Buyer</th>
                <th>Location</th>
                <th>Orders</th>
                <th>LTV</th>
                <th>Segment</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {buyers.slice(0, 20).map((b, i) => {
                const seg = b.total > 1_000_000 ? "VIP" : b.orders > 1 ? "Repeat" : "New";
                return (
                  <tr key={b.name}>
                    <td>
                      <div style={{ display: "flex", gap: 11, alignItems: "center" }}>
                        <Av name={b.name} size={36} seed={i + 10} square />
                        <div>
                          <div style={{ fontWeight: 600, fontSize: 13.5 }}>{b.name}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{b.city}</td>
                    <td><strong>{b.orders}</strong></td>
                    <td className="money" style={{ fontWeight: 600 }}>{fmt(b.total)}</td>
                    <td>
                      {seg === "VIP" && <Badge variant="amber" dot><Icon name="star" size={10} /> VIP</Badge>}
                      {seg === "Repeat" && <Badge variant="mint" dot>Repeat</Badge>}
                      {seg === "New" && <Badge variant="info" dot>New</Badge>}
                    </td>
                    <td>
                      <MessageBuyerButton sellerUserId={b.id} sellerName={b.name} />
                    </td>
                  </tr>
                );
              })}
              {buyers.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>
                    No buyers yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
