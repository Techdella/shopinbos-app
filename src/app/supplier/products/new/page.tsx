import { db } from "@/lib/db/client";
import { creditBalance } from "@/lib/ai/credits.server";
import { billingEmail } from "@/lib/auth/billing-email";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser, isProPlan } from "@/lib/role-queries";
import { AppPage, AssistantNote, Card } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { createSupplierProduct } from "@/app/actions/supplier";
import { SupplierProductForm } from "@/components/supplier/SupplierProductForm";
import { PlanUpgradeSection } from "@/components/payments/PlanUpgradeSection";
import { getT } from "@/lib/i18n/server";

export default async function NewSupplierProductPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string }>;
}) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const params = searchParams ? await searchParams : {};
  const t = await getT("supplier");

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
      title={t("newProduct.title")}
      sub={t("newProduct.sub")}
    >
      {atStarterLimit ? (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <Card className="p-5">
            <h2 className="m-0 text-[17px] font-extrabold">{t("newProduct.limitTitle")}</h2>
            <p className="mb-0 mt-2 text-[14.5px] leading-[1.55] text-app-ink-soft">
              {t("newProduct.limitBody", { count: productCount })}
            </p>
          </Card>
          <PlanUpgradeSection userEmail={billingEmail(user)} userName={user.name} aiCredits={aiCredits} creditBalance={await creditBalance(user.id)} />
        </div>
      ) : (
        <>
          {supplier.verificationStatus !== "verified" && (
            <div className="mb-5">
              <AssistantNote who="rex">{t("newProduct.draftsNote")}</AssistantNote>
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
