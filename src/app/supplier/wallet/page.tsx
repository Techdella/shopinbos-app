import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { loadWalletView } from "@/lib/wallet/wallet.server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("wallet"))("page.title") };
}

export default async function SupplierWalletPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const view = await loadWalletView({ id: user.id, role: "supplier" });
  const t = await getT("wallet");
  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("page.title")} sub={t("page.subSupplier")}>
      <WalletPanel view={view} role="supplier" ownerName={user.name} />
    </AppPage>
  );
}
