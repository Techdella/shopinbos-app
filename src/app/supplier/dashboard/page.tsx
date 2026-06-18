import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { DataTable, RolePage, formatDate, formatMoney } from "@/components/role/RolePage";
import { Badge, Icon } from "@/components/ui";

async function getRecommendedLogistics(supplier: { city: string; country: string }) {
  return db.logisticsPartner.findMany({
    where: {
      status: "active",
      verificationStatus: "verified",
      OR: [
        { coverageZones: { has: supplier.city } },
        { city: supplier.city },
      ],
    },
    take: 4,
    select: {
      id: true,
      displayName: true,
      city: true,
      rating: true,
      reliabilityScore: true,
      estimatedSpeed: true,
      basePrice: true,
    },
    orderBy: [{ rating: "desc" }, { reliabilityScore: "desc" }],
  });
}

async function getActiveSellersByCategory(supplier: { id: string }) {
  const supplierProducts = await db.supplierProduct.findMany({
    where: { supplierId: supplier.id },
    select: { categoryId: true },
    take: 50,
  });
  const categoryIds = [...new Set(supplierProducts.map((p) => p.categoryId))];

  if (categoryIds.length === 0) return [];

  const recentOrders = await db.wholesaleOrder.findMany({
    where: {
      supplierProduct: { categoryId: { in: categoryIds } },
      supplierId: { not: supplier.id },
      status: { in: ["confirmed", "processing", "shipped", "delivered"] },
    },
    select: {
      seller: { select: { id: true, name: true, city: true, country: true } },
    },
    distinct: ["sellerId"],
    take: 4,
    orderBy: { createdAt: "desc" },
  });

  return recentOrders.map((o) => o.seller).filter((s) => s.id);
}

export default async function SupplierDashboardPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const [totalProducts, publishedProducts, pendingQuotes, openOrders, recentQuotes, topProducts, recommendedLogistics, activeSellers] = await Promise.all([
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
    db.supplierProduct.count({ where: { supplierId: supplier.id, status: "published" } }),
    db.supplierQuoteRequest.count({ where: { supplierId: supplier.id, status: "pending" } }),
    db.wholesaleOrder.count({
      where: { supplierId: supplier.id, status: { in: ["pending", "confirmed", "processing", "shipped"] } },
    }),
    db.supplierQuoteRequest.findMany({
      where: { supplierId: supplier.id },
      orderBy: { createdAt: "desc" },
      take: 5,
      select: {
        id: true,
        quantity: true,
        destination: true,
        status: true,
        createdAt: true,
        seller: { select: { name: true } },
        supplierProduct: { select: { name: true } },
      },
    }),
    db.supplierProduct.findMany({
      where: { supplierId: supplier.id },
      orderBy: [{ trendScore: "desc" }, { createdAt: "desc" }],
      take: 5,
      select: {
        id: true,
        name: true,
        status: true,
        wholesalePrice: true,
        currency: true,
        stockQuantity: true,
        trendScore: true,
      },
    }),
    getRecommendedLogistics(supplier),
    getActiveSellersByCategory(supplier),
  ]);

  return (
    <RolePage
      role="supplier"
      eyebrow="Supplier portal"
      title={`Good to see you, ${user.name}`}
      description={`${supplier.displayName} is ${supplier.verificationStatus}. Public visibility starts when the supplier is verified and products are published.`}
      actions={[
        { label: "Add product", href: "/supplier/products/new" },
        { label: "Review quotes", href: "/supplier/quote-requests" },
      ]}
      metrics={[
        { label: "Catalog items", value: String(totalProducts), sub: `${publishedProducts} published` },
        { label: "Pending quotes", value: String(pendingQuotes), sub: "Need supplier response" },
        { label: "Open orders", value: String(openOrders), sub: "Wholesale flow" },
        { label: "Trust score", value: String(supplier.trustScore), sub: supplier.verificationStatus },
      ]}
    >
      {supplier.verificationStatus === "pending" && (
        <div
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            background: "var(--amber-100)",
            border: "1px solid var(--amber-300)",
            color: "var(--amber-900)",
            fontSize: 13,
            fontWeight: 600,
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span style={{ fontSize: 18 }}>⏳</span>
          Your profile is under review. Public visibility starts once an admin verifies your documents.
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
        <DataTable
          title="Recent Quote Requests"
          empty="No quote requests yet."
          rows={recentQuotes}
          columns={[
            { label: "Product", value: (row) => row.supplierProduct.name },
            { label: "Seller", value: (row) => row.seller.name },
            { label: "Qty", value: (row) => row.quantity },
            { label: "Status", value: (row) => row.status },
            { label: "Created", value: (row) => formatDate(row.createdAt) },
          ]}
        />
        <DataTable
          title="Top Products"
          empty="Add products to build your public catalog."
          rows={topProducts}
          columns={[
            { label: "Product", value: (row) => row.name },
            { label: "Status", value: (row) => row.status },
            { label: "Stock", value: (row) => row.stockQuantity },
            { label: "Price", value: (row) => formatMoney(row.wholesalePrice, row.currency) },
            { label: "Trend", value: (row) => row.trendScore },
          ]}
        />
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
        {recommendedLogistics.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="truck" size={16} />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Logistics in {supplier.city}</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {recommendedLogistics.map((partner) => (
                <div key={partner.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "var(--ink-50)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{partner.displayName}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                      {partner.city} · {partner.estimatedSpeed ?? "Standard delivery"}
                    </div>
                  </div>
                  <div style={{ textAlign: "right" }}>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>★ {partner.rating.toFixed(1)}</div>
                    <div style={{ fontSize: 11, color: "var(--ink-500)" }}>₦{partner.basePrice}/km</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeSellers.length > 0 && (
          <div className="card" style={{ padding: 16 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
              <Icon name="users" size={16} />
              <h3 style={{ margin: 0, fontSize: 14, fontWeight: 700 }}>Active sellers · same category</h3>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {activeSellers.map((seller) => (
                <div key={seller.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 10px", borderRadius: 8, background: "var(--ink-50)" }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{seller.name}</div>
                    <div style={{ fontSize: 11.5, color: "var(--ink-500)" }}>
                      {seller.city ?? ""}{seller.city && seller.country ? " · " : ""}{seller.country ?? ""}
                    </div>
                  </div>
                  <Badge variant="mint" dot>Active buyer</Badge>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </RolePage>
  );
}
