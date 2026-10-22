import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { ContractList } from "@/components/contracts/ContractViews";
import { contractsFor, unwrittenFor } from "@/lib/contracts/contracts.server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("contracts"))("title") };
}

// The shop's contracts: Dropship agreements with suppliers and Delivery service agreements with delivery partners
// (src/lib/contracts/contracts.server.ts). Only the two sides can read them.
export default async function SellerContractsPage() {
  const user = await requireRole(["seller"], "/login");
  const [store, rows, unwritten, t] = await Promise.all([
    db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } }),
    contractsFor(user.id),
    unwrittenFor(user.id, "seller"),
    getT("contracts"),
  ]);
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("title")} sub={t("sub")}>
      <ContractList rows={rows} base="/home/contracts" unwritten={unwritten} />
    </SellerPage>
  );
}
