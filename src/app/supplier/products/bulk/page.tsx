import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { getT } from "@/lib/i18n/server";
import { BulkAddWithPeggy } from "@/components/products/bulk/BulkAddWithPeggy";

// "Add many with Peggy" for suppliers: pick many product photos, Peggy names them, price them by chatting.

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("bulkAdd");
  return { title: t("title") };
}

export default async function SupplierBulkAddPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("bulkAdd", "supplier");

  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("title")} sub={t("entry.sub")} actions={<PillLink href="/supplier/products" icon="arrowLeft">{t("products.title")}</PillLink>}>
      <BulkAddWithPeggy role="supplier" productsHref="/supplier/products" importHref="/supplier/products/import" oneHref="/supplier/products/new" />
    </AppPage>
  );
}
