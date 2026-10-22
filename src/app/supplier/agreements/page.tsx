import type { Metadata } from "next";
import Link from "next/link";
import { requireRole } from "@/lib/server-auth";
import { ensureSupplierAccess, getSupplierForUser } from "@/lib/role-queries";
import { AppPage, Card, EmptyState } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { agreementsForSupplier } from "@/lib/marketplace/agreements.server";
import { AGREEMENT_POINTS } from "@shared/supplier-trust";
import { getT } from "@/lib/i18n/server";
import { AgreementAnswer } from "./AgreementAnswer";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Dropship agreements" };

// Shops that want to dropship this supplier's products (src/lib/marketplace/agreements.server.ts). A shop calls the
// supplier and checks the stock first, then accepts the Dropship agreement; it can only list the supplier's
// products once the supplier accepts it here too.
export default async function SupplierAgreementsPage() {
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  ensureSupplierAccess(supplier);
  const t = await getT("supplier", "marketplace", "contracts");
  const tipT = await getT("tips");
  const rows = await agreementsForSupplier(supplier!.id);
  return (
    <AppPage frame={supplierFrame(user, supplier)} title={t("agr.title")} sub={t("agr.sub")}>
      <PageTip who="peggy" className="mb-5">{tipT("supplier.agreements")}</PageTip>
      <div className="grid gap-4">
        <Card className="grid gap-2 p-5">
          <h2 className="m-0 text-[15px] font-extrabold">{t("agr.whatYouAgree")}</h2>
          <ul className="m-0 grid list-disc gap-1 pl-5 text-[13.5px] leading-[1.5]">
            {Array.from({ length: AGREEMENT_POINTS }, (_, index) => <li key={index}>{t.dynamic(`trust.point.${index}`, "")}</li>)}
          </ul>
        </Card>
        {rows.length ? (
          <ul className="m-0 grid list-none gap-3 p-0">
            {rows.map((row) => (
              <li key={row.id}>
                <Card className="grid gap-2 p-4 text-[14px]">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <span className="text-[16px] font-extrabold">{row.shopName}</span>
                    <span className="text-[13px] font-bold text-app-ink-soft">{t.dynamic(`agr.status.${row.status}`, row.status)}</span>
                  </div>
                  <div className="text-[13px] text-app-ink-soft">
                    {[row.shopCity, row.phone, row.stockCheck === "visit" ? t("agr.visited") : t("agr.videoCalled"), row.products ? t("agr.listed", { count: row.products }) : null].filter(Boolean).join(" · ")}
                  </div>
                  {row.sellerNote ? <p className="m-0 whitespace-pre-line text-[13.5px]">&ldquo;{row.sellerNote}&rdquo;</p> : null}
                  {row.supplierNote ? <p className="m-0 text-[13px] text-app-ink-soft">{t("agr.youSaid", { note: row.supplierNote })}</p> : null}
                  {row.status === "requested" ? <AgreementAnswer agreementId={row.id} shopName={row.shopName} contractId={row.contractId} /> : null}
                  {row.status !== "requested" && row.contractId ? <Link href={`/supplier/contracts/${row.contractId}`} className="text-[13.5px] font-extrabold text-app-ink">{t("agr.openContract")} ›</Link> : null}
                </Card>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState icon="people" title={t("agr.none")}>{t("agr.noneSub")}</EmptyState>
        )}
      </div>
    </AppPage>
  );
}
