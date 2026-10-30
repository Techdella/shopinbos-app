import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AppPage } from "@/components/app-kit";
import { featureOn } from "@/lib/feature-switches.server";
import { getT } from "@/lib/i18n/server";
import { RESELL_FEATURE } from "@shared/resell";
import { ResellMarket } from "./ResellMarket";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("resell");
  return { title: t("metaTitle") };
}

// Resell, for resellers (pilot "resell"; any signed-in account it is on for, e.g. pilot users with an invite code):
// products from shops in the pilot they may resell, "Get my link", and their sales and what the shops owe them.
export default async function ResellPage() {
  const user = await requireRole(["seller", "supplier", "logistics_partner", "admin"], "/login");
  if (!(await featureOn(user.id, RESELL_FEATURE))) notFound();
  const t = await getT("resell");
  const content = <ResellMarket />;
  if (user.role !== "seller") {
    return (
      <AppPage frame={{ role: user.role, userName: user.name, avatarUrl: user.avatarUrl, userEmail: user.email }} title={t("market.title")} sub={t("market.sub")}>
        {content}
      </AppPage>
    );
  }
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("market.title")} sub={t("market.sub")}>
      {content}
    </SellerPage>
  );
}
