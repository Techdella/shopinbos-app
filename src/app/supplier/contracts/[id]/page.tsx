import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { ContractCopyView } from "@/components/contracts/ContractViews";
import { contractCopy, untouched } from "@/lib/contracts/contracts.server";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Contract" };

export default async function SupplierContractPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const { id } = await params;
  const copy = await contractCopy(user.id, id.slice(0, 40));
  if (!copy) notFound();
  // A shop's request still waiting: the supplier signs where it accepts the request, so the listing opens too.
  const request = copy.contract.kind === "dropship" && copy.contract.supplierAgreementId
    ? await db.supplierAgreement.findUnique({ where: { id: copy.contract.supplierAgreementId }, select: { status: true } })
    : null;
  const acceptThere = copy.side === "b" && copy.contract.status === "awaiting" && request?.status === "requested";
  const t = await getT("supplier", "contracts");
  return (
    <AppPage frame={supplierFrame(user, supplier)} title={copy.contract.title} sub={`${copy.reference} · ${copy.side === "a" ? copy.contract.partyBName : copy.contract.partyAName}`}>
      <ContractCopyView
        copy={copy}
        back="/supplier/contracts"
        intact={untouched(copy)}
        signHere={!acceptThere}
        extra={acceptThere ? <Notice tone="info">{t("agr.checkFirst", { shop: copy.contract.partyAName })} <Link href="/supplier/agreements" className="font-extrabold text-app-ink">{t("sign.signAndAccept")}</Link></Notice> : null}
      />
    </AppPage>
  );
}
