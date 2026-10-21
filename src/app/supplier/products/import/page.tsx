import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, AssistantNote, Card, CardHead, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { db } from "@/lib/db/client";
import { getT } from "@/lib/i18n/server";
import { supplierPlanLimits } from "@/lib/plan-limits";
import { SUPPLIER_IMPORT_COLUMNS, SUPPLIER_IMPORT_MAX_ROWS } from "@shared/supplier-import";
import { SupplierImportForm } from "./SupplierImportForm";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("supplier"))("imp.title") };
}

export default async function SupplierImportPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "common");
  const [dbUser, categories] = await Promise.all([
    db.user.findUnique({ where: { id: user.id }, select: { aiCredits: true } }),
    db.category.findMany({ orderBy: { name: "asc" }, select: { name: true } }),
  ]);
  const allowed = supplierPlanLimits(dbUser ?? {}).bulkUpload;

  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("imp.title")} sub={t("imp.sub", { max: SUPPLIER_IMPORT_MAX_ROWS })}>
      <div className="grid gap-5">
        {!allowed ? (
          <AssistantNote who="rex" action={<PillLink href="/supplier/profile?tab=Billing%20%26%20Plan" tone="ink" size="sm">{t("products.seePlans")}</PillLink>}>
            {t("imp.locked")}
          </AssistantNote>
        ) : (
          <SupplierImportForm />
        )}
        <Card className="p-5">
          <CardHead title={t("imp.columns")} sub={t("imp.columnsSub")} />
          <p className="mb-0 mt-3 break-words font-mono text-[12.5px]">{SUPPLIER_IMPORT_COLUMNS.join(",")}</p>
          <p className="mb-0 mt-3 text-[13.5px] text-app-ink-soft">{t("imp.categories")} {categories.map((category) => category.name).join(", ")}</p>
        </Card>
      </div>
    </AppPage>
  );
}
