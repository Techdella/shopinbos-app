import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { featureOn } from "@/lib/feature-switches.server";
import { getT } from "@/lib/i18n/server";
import { GroupBuysDashboard } from "@/components/together/GroupBuysDashboard";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("together");
  return { title: t("groups.title") };
}

// Group buys for the seller's products (pilot "group_buy").
export default async function Page() {
  const user = await requireRole(["seller"], "/login");
  if (!(await featureOn(user.id, "group_buy"))) notFound();
  const t = await getT("together");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("groups.title")} sub={t("groups.sub")}>
      <GroupBuysDashboard />
    </SellerPage>
  );
}
