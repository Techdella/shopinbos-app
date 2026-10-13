import { db } from "@/lib/db/client";
import { billingEmail } from "@/lib/auth/billing-email";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser, isProPlan } from "@/lib/role-queries";
import { AppPage, AssistantNote, Card } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
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
    <AppPage
      frame={supplierFrame(user, supplier)}
      title="Add a product"
      sub="Trade terms, photos, stock and fulfilment in one pass. Save a draft any time, then send it to marketplace review."
    >
      {atStarterLimit ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <h2 className="m-0 text-[17px] font-extrabold">Free product limit reached</h2>
            <p className="mb-0 mt-2 text-[14.5px] leading-[1.55] text-app-ink-soft">
              The free plan includes up to 50 products ({productCount} in your catalogue). Upgrade to Supplier Max (₦25,000/month) to add more.
            </p>
          </Card>
          <PlanUpgradeSection userEmail={billingEmail(user)} userName={user.name} aiCredits={aiCredits} />
        </div>
      ) : (
        <>
          {supplier.verificationStatus !== "verified" && (
            <div className="mb-5">
              <AssistantNote who="rex">You can save drafts now. Products go live once your business is verified.</AssistantNote>
            </div>
          )}
          <SupplierProductForm
            mode="create"
            action={createSupplierProduct}
            categories={categories}
            error={params?.error}
          />
        </>
      )}
    </AppPage>
  );
}
