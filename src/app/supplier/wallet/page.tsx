import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { WalletPanel } from "@/components/wallet/WalletPanel";
import { loadWalletView } from "@/lib/wallet/wallet.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Shopinbos Wallet" };

export default async function SupplierWalletPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const view = await loadWalletView({ id: user.id, role: "supplier" });
  return (
    <AppPage frame={supplierFrame(user, supplier)} title="Shopinbos Wallet" sub="Your cost on every paid dropship order goes straight to your bank.">
      <WalletPanel view={view} role="supplier" ownerName={user.name} />
    </AppPage>
  );
}
