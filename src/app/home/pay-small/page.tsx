import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { featureOn } from "@/lib/feature-switches.server";
import { getT } from "@/lib/i18n/server";
import { PlansDashboard } from "@/components/together/PlansDashboard";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("together");
  return { title: t("plans.title") };
}

// Paying small small (pilot "pay_small_small"): plans, progress, next due dates and the settlement report of every part that
// landed. Every part settled straight to the seller's bank through Paystack: Shopinbos never held it.
export default async function Page() {
  const user = await requireRole(["seller"], "/login");
  if (!(await featureOn(user.id, "pay_small_small"))) notFound();
  const t = await getT("together");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("plans.title")} sub={t("plans.sub")}>
      <PlansDashboard />
    </SellerPage>
  );
}
