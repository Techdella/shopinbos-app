import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser, isProPlan } from "@/lib/role-queries";
import { RolePage } from "@/components/role/RolePage";
import { createSupplierProduct } from "@/app/actions/supplier";
import { SupplierProductForm } from "@/components/supplier/SupplierProductForm";
import { PlanUpgradeSection } from "@/components/payments/PlanUpgradeSection";

export default async function NewSupplierProductPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const params = searchParams ? await searchParams : {};

  const [categories, productCount, dbUser] = await Promise.all([
    db.category.findMany({
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, slug: true },
      take: 20,
    }),
    db.supplierProduct.count({ where: { supplierId: supplier.id } }),
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
  ]);

  const aiCredits = dbUser?.aiCredits ?? 5;
  const atStarterLimit = !isProPlan({ aiCredits }) && productCount >= 50;

  return (
    <RolePage
      role="supplier"
      eyebrow="New product"
      title="Create a supplier product"
      description="Add trade terms, product media, stock, and fulfilment settings in one pass. Rex keeps the product ready for marketplace review."
      metrics={[
        { label: "Verification", value: supplier.verificationStatus, sub: "Supplier status", icon: "check", tone: "amber" },
        { label: "Catalog", value: `${Math.min(productCount, 50)}/50`, sub: isProPlan({ aiCredits }) ? "Supplier Max" : "Free listing limit", icon: "layers", tone: "teal" },
        { label: "Default route", value: "Review", sub: "Draft or pending", icon: "flag", tone: "indigo" },
      ]}
      assistantNote="Rex checks the product as you go: price, margin, images, fulfilment, and the pieces admins need for review."
    >
      {atStarterLimit ? (
        <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="card tight">
            <div className="text-[14px] font-semibold text-[var(--ink-900)]">Free product limit reached</div>
            <div className="mt-2 text-[13px] leading-6 text-[var(--ink-600)]">
              Free plan includes up to 50 products. Upgrade to Supplier Max (₦25,000/month) to add more products.
            </div>
          </div>
          <PlanUpgradeSection userEmail={billingEmail(user)} userName={user.name} aiCredits={aiCredits} />
        </div>
      ) : (
        <SupplierProductForm
          mode="create"
          action={createSupplierProduct}
          categories={categories}
          error={params?.error}
        />
      )}
    </RolePage>
  );
}
