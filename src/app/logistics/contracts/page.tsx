import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { ContractList } from "@/components/contracts/ContractViews";
import { contractsFor } from "@/lib/contracts/contracts.server";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("contracts"))("title") };
}

// The delivery partner's contracts: a Delivery service agreement with each shop or supplier that connected it,
// to read and sign (src/lib/contracts/contracts.server.ts). Only the two sides can read them.
export default async function LogisticsContractsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const [rows, t] = await Promise.all([contractsFor(user.id), getT("contracts")]);
  const tipT = await getT("tips");
  return (
    <PartnerPage frame={{ user, partner }} title={t("title")} sub={t("sub")}>
      <PageTip who="peggy" className="mb-5">{tipT("logistics.contracts")}</PageTip>
      <ContractList rows={rows} base="/logistics/contracts" />
    </PartnerPage>
  );
}
