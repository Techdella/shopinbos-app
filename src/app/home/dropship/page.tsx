import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Badge, Icon } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function SellerDropshipPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);

  const relationships = await db.dropshipRelationship.findMany({
    where: { sellerId: user.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    include: {
      supplier: { select: { displayName: true, city: true, country: true, trustScore: true } },
      supplierProduct: { select: { name: true, stockQuantity: true, processingTime: true } },
      storeProduct: { select: { name: true, status: true } },
    },
  });

  const active = relationships.filter((r) => r.status === "active");
  const lowStock = relationships.filter((r) => r.supplierProduct.stockQuantity > 0 && r.supplierProduct.stockQuantity < 5);

  return (
    <AppFrame
      role="seller"
      storeName={workspace?.store?.name ?? "Store"}
      storeSlug={workspace?.store?.slug ?? ""}
      storeInitial={workspace?.store?.name?.charAt(0).toUpperCase() ?? "S"}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 18 }}>
        <PageHead
          title="Dropship Hub"
          sub={`${relationships.length} supplier relationships · ${active.length} active · ${lowStock.length} low stock alerts`}
          actions={<a href="/marketplace?dropship=true" className="dbtn dBtn-mint" style={{ textDecoration: "none" }}>Find dropship products</a>}
        />

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          <div className="stat">
            <div className="stat-lbl">Relationships</div>
            <div className="stat-val">{relationships.length}</div>
            <div className="stat-delta delta-up"><Icon name="link" size={12} /><span>total</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Active</div>
            <div className="stat-val">{active.length}</div>
            <div className="stat-delta delta-up"><Icon name="check" size={12} /><span>selling</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Low stock</div>
            <div className="stat-val">{lowStock.length}</div>
            <div className="stat-delta delta-down"><Icon name="info" size={12} /><span>needs attention</span></div>
          </div>
          <div className="stat">
            <div className="stat-lbl">Suppliers</div>
            <div className="stat-val">{new Set(relationships.map((r) => r.supplierId)).size}</div>
            <div className="stat-delta delta-up"><Icon name="users" size={12} /><span>partners</span></div>
          </div>
        </div>

        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <table className="tbl">
            <thead>
              <tr>
                <th>Store product</th>
                <th>Supplier product</th>
                <th>Supplier</th>
                <th>Stock</th>
                <th>Lead time</th>
                <th>Trust</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {relationships.map((r) => (
                <tr key={r.id}>
                  <td style={{ fontWeight: 600, fontSize: 13 }}>{r.storeProduct.name}</td>
                  <td>{r.supplierProduct.name}</td>
                  <td style={{ fontSize: 12.5 }}>
                    {r.supplier.displayName} · {r.supplier.city}, {r.supplier.country}
                  </td>
                  <td>
                    {r.supplierProduct.stockQuantity > 5
                      ? <Badge variant="mint">{r.supplierProduct.stockQuantity}</Badge>
                      : r.supplierProduct.stockQuantity > 0
                        ? <Badge variant="warn">{r.supplierProduct.stockQuantity}</Badge>
                        : <Badge variant="danger">OOS</Badge>}
                  </td>
                  <td style={{ fontSize: 12.5 }}>{r.supplierProduct.processingTime ?? "Not listed"}</td>
                  <td>{r.supplier.trustScore ?? "—"}</td>
                  <td><Badge variant={r.status === "active" ? "mint" : r.status === "paused" ? "warn" : "info"}>{r.status}</Badge></td>
                </tr>
              ))}
              {relationships.length === 0 && (
                <tr><td colSpan={7} style={{ padding: 24, color: "var(--ink-500)", textAlign: "center" }}>
                  No dropship relationships yet. Add a dropship product from the marketplace to start.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppFrame>
  );
}
