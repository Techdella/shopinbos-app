import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { featureOn } from "@/lib/feature-switches.server";
import { getT } from "@/lib/i18n/server";
import { AjoList } from "@/components/together/AjoDashboard";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("together");
  return { title: t("ajoList.title") };
}

// Ajo groups the seller runs (pilot "ajo"). Groups are started from a product's page (Other ways to buy).
export default async function Page() {
  const user = await requireRole(["seller"], "/login");
  if (!(await featureOn(user.id, "ajo"))) notFound();
  const t = await getT("together");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("ajoList.title")} sub={t("ajoList.sub")}>
      <AjoList />
    </SellerPage>
  );
}
