import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { isImportOpen } from "@/lib/imports/pure";
import { chinaImportsOpen, importStatus, listStoreImports } from "@/lib/imports/service.server";
import { isMissingTable } from "@/lib/rate-limit-core";
import { getLocale, getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";
import type { ImportActionLabels } from "./ImportActions";
import { ImportsBody, type ImportRow } from "./ImportsBody";

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("products");
  return { title: t("imp.title") };
}

export default async function ImportsPage({ searchParams }: { searchParams?: Promise<{ requested?: string; open?: string }> }) {
  const params = (await searchParams) ?? {};
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("products", "common");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, brandSettings: true } });
  if (!store) redirect("/builder?firstRun=1");
  let imports: ImportRow[] = [];
  try {
    imports = await listStoreImports(store.id);
  } catch (error) {
    if (!isMissingTable(error)) throw error;
  }
  const open = chinaImportsOpen();
  const openId = params.open && imports.some((item) => item.id === params.open) ? params.open : (imports.find((item) => isImportOpen(importStatus(item)) && item.status !== "requested") ?? imports[0])?.id;
  const labels: ImportActionLabels = {
    acceptPay: t("imp.acceptPay", { amount: "{amount}" }),
    accept: t("imp.accept"),
    decline: t("imp.decline"),
    declineReason: t("imp.declineReason"),
    declineSend: t("imp.declineSend"),
    keep: t("imp.keep"),
    payAgain: t("imp.payAgain"),
    cancel: t("imp.cancel"),
    addToProducts: t("imp.addToProducts"),
    inProducts: t("imp.inProducts"),
    failed: t("imp.failed"),
  };

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("imp.title")}
      sub={open ? t("imp.subOpen") : t("imp.sub")}
      actions={open ? <PillLink href="/marketplace?tab=china" tone="ink" icon="plus">{t("imp.new")}</PillLink> : undefined}
    >
      <ImportsBody imports={imports} open={open} openId={openId} requested={params.requested} labels={labels} tip={open ? null : <PageTip>{tipT("imports")}</PageTip>} t={t} locale={locale} />
    </SellerPage>
  );
}
