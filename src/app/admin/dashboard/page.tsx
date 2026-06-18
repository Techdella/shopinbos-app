import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { DataTable, RolePage, formatDate } from "@/components/role/RolePage";

export default async function AdminDashboardPage() {
  const user = await requireRole(["admin"], "/admin/login");

  const [suppliers, products, logisticsPartners, categories, pendingProducts, pendingSuppliers, pendingLogistics] = await Promise.all([
    db.supplier.count(),
    db.supplierProduct.count(),
    db.logisticsPartner.count(),
    db.category.count(),
    db.supplierProduct.count({ where: { status: "pending_review" } }),
    db.supplier.count({ where: { verificationStatus: "pending" } }),
    db.logisticsPartner.count({ where: { verificationStatus: "pending" } }),
  ]);
  const recentProducts = await db.supplierProduct.findMany({
    orderBy: { updatedAt: "desc" },
    take: 8,
    select: {
      id: true,
      name: true,
      status: true,
      updatedAt: true,
      supplier: { select: { displayName: true, verificationStatus: true } },
    },
  });

  return (
    <RolePage
      role="admin"
      eyebrow="Admin"
      title={`Control center, ${user.name}`}
      description="Invite-only operations for supplier approvals, product moderation, logistics verification, and public marketplace readiness."
      metrics={[
        { label: "Suppliers", value: String(suppliers), sub: `${pendingSuppliers} pending` },
        { label: "Products", value: String(products), sub: `${pendingProducts} pending review` },
        { label: "Logistics", value: String(logisticsPartners), sub: `${pendingLogistics} pending` },
        { label: "Categories", value: String(categories) },
      ]}
    >
      <DataTable
        title="Recent Product Moderation"
        empty="No products yet."
        rows={recentProducts}
        columns={[
          { label: "Product", value: (row) => row.name },
          { label: "Supplier", value: (row) => row.supplier.displayName },
          { label: "Supplier status", value: (row) => row.supplier.verificationStatus },
          { label: "Product status", value: (row) => row.status },
          { label: "Updated", value: (row) => formatDate(row.updatedAt) },
        ]}
      />
    </RolePage>
  );
}
