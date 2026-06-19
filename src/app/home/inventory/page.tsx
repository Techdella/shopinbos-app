import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { db } from "@/lib/db/client";
import { AppFrame } from "@/components/shell/AppFrame";
import { PageHead, Icon, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

function stockStatus(current: number, threshold: number): { label: string; variant: "mint" | "warn" | "coral" | "ghost" } {
  if (current <= 0) return { label: "Out of stock", variant: "coral" };
  if (current <= threshold) return { label: "Low stock", variant: "warn" };
  return { label: "In stock", variant: "mint" };
}

export default async function InventoryPage() {
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  const storeName = workspace?.store?.name ?? "Your Store";
  const storeSlug = workspace?.store?.slug;
  const store = workspace?.store;

  const products = store
    ? await db.storeProduct.findMany({
        where: { storeId: store.id },
        orderBy: [{ currentStock: "asc" }, { updatedAt: "desc" }],
        select: {
          id: true,
          name: true,
          sku: true,
          status: true,
          currentStock: true,
          reservedStock: true,
          soldStock: true,
          incomingStock: true,
          lowStockThreshold: true,
          images: true,
          retailPrice: true,
          currency: true,
          fulfillmentType: true,
          supplierProductId: true,
          supplierProduct: {
            select: {
              stockQuantity: true,
              supplier: { select: { displayName: true } },
            },
          },
        },
      })
    : [];

  const totalProducts = products.length;
  const outOfStock = products.filter((p) => p.currentStock <= 0).length;
  const lowStock = products.filter((p) => p.currentStock > 0 && p.currentStock <= p.lowStockThreshold).length;
  const merchantFulfilled = products.filter((p) => p.fulfillmentType === "merchant_fulfilled");
  const totalUnits = merchantFulfilled.reduce((sum, p) => sum + p.currentStock, 0);

  return (
    <AppFrame
      role="seller"
      storeName={storeName}
      storeSlug={storeSlug}
      storeInitial={storeName.charAt(0).toUpperCase()}
      userName={user.name}
      userInitials={user.name.split(" ").map((p) => p[0]).join("").toUpperCase().slice(0, 2)}
      avatarUrl={user.avatarUrl}
      userEmail={user.email}
    >
      <div style={{ padding: "24px 28px 40px", display: "flex", flexDirection: "column", gap: 20 }}>
        <PageHead
          title="Inventory"
          sub="Track stock levels across your products"
          actions={
            <Link href="/products" className="dbtn dBtn-ghost" style={{ textDecoration: "none" }}>
              Manage products
            </Link>
          }
        />

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
          {[
            { label: "Total products", value: totalProducts, color: "var(--ink-400)" },
            { label: "Total units", value: totalUnits, color: "var(--teal-600)" },
            { label: "Low stock", value: lowStock, color: "var(--amber-600)" },
            { label: "Out of stock", value: outOfStock, color: "var(--coral)" },
          ].map((stat) => (
            <div key={stat.label} className="card" style={{ padding: "12px 14px", borderLeft: `3px solid ${stat.color}` }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: "var(--ink-500)", textTransform: "uppercase", letterSpacing: "0.06em" }}>
                {stat.label}
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: "var(--ink-900)", marginTop: 2 }}>{stat.value}</div>
            </div>
          ))}
        </div>

        {/* Inventory table */}
        {products.length === 0 ? (
          <div className="card" style={{ padding: 40, textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
            <div style={{ fontWeight: 700, fontSize: 15, color: "var(--ink-800)" }}>No products yet</div>
            <div style={{ fontSize: 13, color: "var(--ink-500)", marginTop: 6 }}>
              Add products to start tracking inventory.
            </div>
            <Link href="/products/new" className="dbtn dBtn-mint" style={{ textDecoration: "none", display: "inline-flex", marginTop: 16 }}>
              <Icon name="plus" size={14} /> Add product
            </Link>
          </div>
        ) : (
          <div className="card" style={{ padding: 0, overflow: "hidden" }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Product</th>
                  <th>SKU</th>
                  <th style={{ textAlign: "center" }}>In stock</th>
                  <th style={{ textAlign: "center" }}>Reserved</th>
                  <th style={{ textAlign: "center" }}>Sold</th>
                  <th style={{ textAlign: "center" }}>Incoming</th>
                  <th>Status</th>
                  <th>Source</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => {
                  const available = p.currentStock - p.reservedStock;
                  const status = stockStatus(p.currentStock, p.lowStockThreshold);
                  const isDropship = p.fulfillmentType === "dropship" || p.fulfillmentType === "supplier_fulfilled";
                  const supplierStock = p.supplierProduct?.stockQuantity;

                  return (
                    <tr key={p.id}>
                      <td>
                        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                          {p.images[0] ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={p.images[0]}
                              alt={p.name}
                              style={{ width: 32, height: 32, borderRadius: 6, objectFit: "cover", flexShrink: 0 }}
                            />
                          ) : (
                            <div style={{ width: 32, height: 32, borderRadius: 6, background: "var(--ink-100)", display: "grid", placeItems: "center", flexShrink: 0 }}>
                              <Icon name="box" size={14} />
                            </div>
                          )}
                          <div style={{ fontWeight: 600, fontSize: 13, color: "var(--ink-900)" }}>{p.name}</div>
                        </div>
                      </td>
                      <td style={{ fontFamily: "var(--font-mono)", fontSize: 11.5, color: "var(--ink-500)" }}>
                        {p.sku ?? "—"}
                      </td>
                      <td style={{ textAlign: "center", fontWeight: 700, fontSize: 14, color: p.currentStock <= 0 ? "var(--coral)" : p.currentStock <= p.lowStockThreshold ? "var(--amber-700)" : "var(--ink-900)" }}>
                        {isDropship ? (supplierStock ?? "—") : p.currentStock}
                      </td>
                      <td style={{ textAlign: "center", fontSize: 13, color: "var(--ink-500)" }}>
                        {isDropship ? "—" : p.reservedStock}
                      </td>
                      <td style={{ textAlign: "center", fontSize: 13, color: "var(--ink-500)" }}>
                        {p.soldStock}
                      </td>
                      <td style={{ textAlign: "center", fontSize: 13, color: "var(--teal-700)", fontWeight: 600 }}>
                        {isDropship ? "—" : (p.incomingStock > 0 ? `+${p.incomingStock}` : "—")}
                      </td>
                      <td>
                        {isDropship ? (
                          <Badge variant="ghost">Dropship</Badge>
                        ) : (
                          <Badge variant={status.variant} dot>{status.label}</Badge>
                        )}
                      </td>
                      <td style={{ fontSize: 12, color: "var(--ink-500)" }}>
                        {isDropship && p.supplierProduct?.supplier?.displayName
                          ? p.supplierProduct.supplier.displayName
                          : isDropship ? "Supplier" : "Own stock"}
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <Link
                          href={`/products/${p.id}`}
                          className="dbtn dBtn-ghost dBtn-sm"
                          style={{ textDecoration: "none" }}
                        >
                          <Icon name="edit" size={12} /> Edit
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {outOfStock > 0 || lowStock > 0 ? (
          <div style={{ padding: "12px 16px", borderRadius: 10, background: "var(--amber-50)", border: "1px solid var(--amber-200)", fontSize: 13, color: "var(--amber-800)", display: "flex", alignItems: "center", gap: 8 }}>
            <Icon name="warn" size={15} />
            {outOfStock > 0 && `${outOfStock} product${outOfStock === 1 ? "" : "s"} out of stock. `}
            {lowStock > 0 && `${lowStock} product${lowStock === 1 ? "" : "s"} running low. `}
            <Link href="/marketplace" style={{ fontWeight: 700, color: "var(--amber-800)", marginLeft: 4 }}>Source from marketplace →</Link>
          </div>
        ) : null}
      </div>
    </AppFrame>
  );
}
