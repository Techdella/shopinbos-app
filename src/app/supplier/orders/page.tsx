import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";
import { updateSupplierOrderStatus } from "@/app/actions/supplier";

export const dynamic = "force-dynamic";

function fmt(n: number) { return "₦" + Math.round(n).toLocaleString("en-US"); }
function fmtDate(d: Date) {
  const diff = Date.now() - d.getTime();
  const m = Math.floor(diff / 60000);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d2 = Math.floor(h / 24);
  if (d2 === 1) return "Yesterday";
  return `${d2} days ago`;
}

const supplierOrderStatuses = ["pending", "confirmed", "processing", "shipped", "delivered", "cancelled"] as const;

function Av({ name, size = 28, seed = 0, square }: { name: string; size?: number; seed?: number; square?: boolean }) {
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

export default async function SupplierOrdersPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const orders = await db.wholesaleOrder.findMany({
    where: { supplierId: supplier.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      seller: { select: { name: true } },
      supplierProduct: { select: { name: true } },
    },
  });

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
      searchPlaceholder="Search by order #, seller, product…"
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Dropship orders"
          sub={`${orders.filter((o) => o.status === "pending").length} to ship today · ${orders.filter((o) => o.status === "shipped").length} in transit · ${orders.length} total`}
          actions={
            <>
              <button className="dbtn dBtn-ghost"><Icon name="document" size={14} /> Print packing slips</button>
              <button className="dbtn dBtn-mint"><Icon name="truck" size={14} /> Mark batch shipped</button>
            </>
          }
        />

        <div className="card" style={{ padding: 14, display: "flex", alignItems: "center", gap: 12, background: "var(--teal-50)", borderColor: "var(--teal-200)" }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: "var(--paper)", display: "grid", placeItems: "center", color: "var(--teal-700)" }}>
            <Icon name="truck" size={16} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: "var(--ink-900)" }}>Fulfilment controls</div>
            <div style={{ fontSize: 12, color: "var(--ink-600)", marginTop: 2 }}>Ship today queue · update status and add a Tracking code when a parcel leaves your workshop.</div>
          </div>
          <div style={{ fontSize: 11, color: "var(--ink-500)" }}>{supplierOrderStatuses.length} supplierOrderStatuses</div>
        </div>

        {/* Status filter pills */}
        <div style={{
          display: "flex", gap: 6, padding: 5,
          background: "var(--paper)", border: "1px solid var(--ink-150)",
          borderRadius: 10, alignSelf: "flex-start",
        }}>
          {[
            { l: "Needs shipping", n: orders.filter((o) => o.status === "pending").length, on: true, color: "var(--warning)" },
            { l: "In transit", n: orders.filter((o) => o.status === "shipped").length, color: "var(--info)" },
            { l: "Delivered", n: orders.filter((o) => o.status === "delivered").length },
            { l: "Cancelled", n: orders.filter((o) => o.status === "cancelled").length },
            { l: "Returns", n: orders.filter((o) => o.status === "refunded").length, color: "var(--danger)" },
          ].map((t, i) => (
            <button key={i}
              className={"dbtn dBtn-sm " + (t.on ? "dBtn-soft" : "")}
              style={{
                padding: "6px 12px",
                color: t.on ? "var(--teal-800)" : t.color || "var(--ink-700)",
              }}
            >
              {t.l} <span style={{ marginLeft: 4, fontFamily: "var(--font-mono)", opacity: 0.7, fontSize: 11 }}>{t.n}</span>
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <div className="sb-search" style={{ flex: "1 1 240px", maxWidth: 380 }}>
            <Icon name="search" size={14} />
            <span style={{ color: "var(--ink-400)" }}>Search by order #, seller, product…</span>
          </div>
          <div className="sel" style={{ minWidth: 120, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-500)" }}>Seller: All</span>
            <Icon name="chevDown" size={12} />
          </div>
          <div className="sel" style={{ minWidth: 120, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-500)" }}>Destination: Any</span>
            <Icon name="chevDown" size={12} />
          </div>
          <div className="sel" style={{ minWidth: 90, fontSize: 12.5, padding: "7px 11px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span style={{ color: "var(--ink-500)" }}>SLA: All</span>
            <Icon name="chevDown" size={12} />
          </div>
          <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
            <button className="dbtn dBtn-ghost dBtn-sm"><Icon name="download" size={13} /> Export</button>
            <button className="dbtn dBtn-ghost dBtn-sm"><Icon name="filter" size={13} /></button>
          </div>
        </div>

        {/* Orders table */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th style={{ width: 30 }}><input type="checkbox" /></th>
                <th>Order</th>
                <th>Seller</th>
                <th>Product</th>
                <th>Qty</th>
                <th>Destination</th>
                <th>Paid</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {orders.length > 0 ? orders.slice(0, 15).map((o, i) => {
                const slaColor = o.status === "pending" ? "warn" : o.status === "shipped" ? "info" : o.status === "delivered" ? "success" : "soft";
                return (
                  <tr key={o.id}>
                    <td><input type="checkbox" /></td>
                    <td style={{ fontFamily: "var(--font-mono)", fontWeight: 600, color: "var(--teal-700)", fontSize: 12 }}>
                      {`PO-${String(i + 1).padStart(4, "0")}`}
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 9, alignItems: "center" }}>
                        <Av name={o.seller?.name ?? "Unknown"} size={26} seed={i + 2} square />
                        {o.seller?.name ?? "Unknown"}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 12.5 }}>{o.supplierProduct?.name ?? "Product"}</div>
                    </td>
                    <td><strong>×{o.quantity}</strong></td>
                    <td style={{ fontSize: 12, color: "var(--ink-600)" }}>{o.deliveryAddress ?? "—"}</td>
                    <td className="money" style={{ fontWeight: 600 }}>{fmt(Number(o.totalPrice))}</td>
                    <td>
                      <Badge variant={slaColor as any} dot>{o.status}</Badge>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: 5 }}>
                        <button className="dbtn dBtn-ghost dBtn-sm" style={{ padding: "3px 7px" }}>
                          <Icon name="document" size={12} />
                        </button>
                        {o.status === "pending" && (
                          <form action={updateSupplierOrderStatus} style={{ display: "flex", gap: 5 }}>
                            <input type="hidden" name="orderId" value={o.id} />
                            <input type="hidden" name="status" value="shipped" />
                            <input type="hidden" name="trackingCode" value={`SIB-${o.id.slice(0, 8).toUpperCase()}`} />
                            <button className="dbtn dBtn-mint dBtn-sm" style={{ padding: "4px 9px", fontSize: 11 }}>Ship</button>
                          </form>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={9} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>
                    No orders yet. Orders will appear here when sellers start stocking your products.
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
