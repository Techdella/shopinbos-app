import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { ContractCopyView } from "@/components/contracts/ContractViews";
import { contractCopy, untouched } from "@/lib/contracts/contracts.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract" };

export default async function SellerContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const { id } = await params;
  const [store, copy] = await Promise.all([db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } }), contractCopy(user.id, id.slice(0, 40))]);
  if (!copy) notFound();
  return (
    <SellerPage user={user} store={storeSummary(store)} title={copy.contract.title} sub={`${copy.reference} · ${copy.side === "a" ? copy.contract.partyBName : copy.contract.partyAName}`}>
      <ContractCopyView copy={copy} back="/home/contracts" intact={untouched(copy)} />
    </SellerPage>
  );
}
