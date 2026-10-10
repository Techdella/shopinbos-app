import Link from "next/link";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser, isProPlan } from "@/lib/role-queries";
import { DataTable, RolePage, formatDate, formatMoney } from "@/components/role/RolePage";
import { Icon } from "@/components/ui/Icon";

export default async function SupplierProductsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);

  const [products, dbUser] = await Promise.all([
    db.supplierProduct.findMany({
      where: { supplierId: supplier.id },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        name: true,
        slug: true,
        status: true,
        wholesalePrice: true,
        currency: true,
        stockQuantity: true,
        dropshipAvailable: true,
        bulkOrderAvailable: true,
        updatedAt: true,
        category: { select: { name: true } },
      },
    }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);
  const isPro = isProPlan(dbUser ?? {});

  return (
    <RolePage
      role="supplier"
      eyebrow="Supplier catalog"
      title="Products"
      description="Manage the products sellers can source from you. Draft privately, then send complete products into marketplace review."
      actions={[{ label: "New product", href: "/supplier/products/new", icon: "plus" }]}
      metrics={[
        { label: "Products", value: isPro ? "Unlimited" : `${Math.min(products.length, 50)}/50`, icon: "box", tone: "amber" },
        { label: "Published", value: String(products.filter((product) => product.status === "published").length), icon: "check", tone: "teal" },
        { label: "Pending review", value: String(products.filter((product) => product.status === "pending_review").length), icon: "flag", tone: "indigo" },
        { label: "Dropship ready", value: String(products.filter((product) => product.dropshipAvailable).length), icon: "truck", tone: "lime" },
      ]}
      assistantNote="Rex is checking catalog gaps: missing stock, products waiting on review, and items that can become dropship-ready."
    >
      {!isPro && products.length >= 50 && (
        <div className="card tight mb-4 flex items-start gap-3 border-[var(--amber-300)] bg-[var(--amber-100)]">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--paper)] text-[var(--amber-500)]">
            <Icon name="flag" size={17} />
          </div>
          <div>
            <div className="text-[13px] font-semibold text-[var(--ink-900)]">Free product limit reached</div>
            <div className="mt-1 text-[12px] leading-5 text-[var(--ink-600)]">
              Free plan includes up to 50 products. Upgrade to Supplier Max (₦25,000/month) from Billing & Plan to add more.
            </div>
          </div>
        </div>
      )}
      <div className="mb-4 grid gap-3 lg:grid-cols-3">
        {[
          { label: "Draft complete products", body: "Add image URLs, MOQ, stock, delivery regions, and tier pricing before review.", icon: "edit" as const },
          { label: "Submit for review", body: "Admins approve public marketplace visibility once the product is complete.", icon: "flag" as const },
          { label: "Keep terms current", body: "Published product edits return to review when public selling fields change.", icon: "refresh" as const },
        ].map((item) => (
          <div key={item.label} className="card tight flex gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[10px] bg-[var(--amber-100)] text-[var(--amber-500)]">
              <Icon name={item.icon} size={17} />
            </div>
            <div>
              <div className="text-[13px] font-semibold text-[var(--ink-900)]">{item.label}</div>
              <div className="mt-1 text-[12px] leading-5 text-[var(--ink-500)]">{item.body}</div>
            </div>
          </div>
        ))}
      </div>
      <DataTable
        title="Supplier Products"
        empty="No products yet."
        rows={products}
        columns={[
          {
            label: "Name",
            value: (row) => (
              <Link href={`/supplier/products/${row.id}/edit`} className="font-semibold text-[var(--teal-700)] no-underline">
                {row.name}
              </Link>
            ),
          },
          { label: "Category", value: (row) => row.category.name },
          { label: "Status", value: (row) => row.status },
          { label: "Stock", value: (row) => `${row.stockQuantity} units` },
          { label: "Terms", value: (row) => [row.dropshipAvailable ? "Dropship" : null, row.bulkOrderAvailable ? "Bulk" : null].filter(Boolean).join(" + ") || "Standard" },
          { label: "Price", value: (row) => formatMoney(row.wholesalePrice, row.currency) },
          { label: "Updated", value: (row) => formatDate(row.updatedAt) },
        ]}
      />
    </RolePage>
  );
}
