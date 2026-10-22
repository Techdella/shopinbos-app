import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { PartnerPage } from "@/components/logistics/kit";
import { ContractCopyView } from "@/components/contracts/ContractViews";
import { contractCopy, untouched } from "@/lib/contracts/contracts.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract" };

export default async function LogisticsContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { id } = await params;
  const copy = await contractCopy(user.id, id.slice(0, 40));
  if (!copy) notFound();
  return (
    <PartnerPage frame={{ user, partner }} title={copy.contract.title} sub={`${copy.reference} · ${copy.side === "a" ? copy.contract.partyBName : copy.contract.partyAName}`}>
      <ContractCopyView copy={copy} back="/logistics/contracts" intact={untouched(copy)} />
    </PartnerPage>
  );
}
