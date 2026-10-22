import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { ContractList } from "@/components/contracts/ContractViews";
import { contractsFor, unwrittenFor } from "@/lib/contracts/contracts.server";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("contracts"))("title") };
}

// The supplier's contracts: Dropship agreements with shops, and Delivery service agreements with the delivery
// partners it connected (src/lib/contracts/contracts.server.ts). Only the two sides can read them.
export default async function SupplierContractsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const [rows, unwritten, t] = await Promise.all([contractsFor(user.id), unwrittenFor(user.id, "supplier"), getT("contracts")]);
  const tipT = await getT("tips");
  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("title")} sub={t("sub")}>
      <PageTip who="peggy" className="mb-5">{tipT("supplier.contracts")}</PageTip>
      <ContractList rows={rows} base="/supplier/contracts" unwritten={unwritten} />
    </AppPage>
  );
}
