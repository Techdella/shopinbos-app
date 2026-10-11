import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { MarketingAnalytics } from "./MarketingAnalytics";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Marketing analytics" };

export default async function MarketingAnalyticsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Marketing analytics"
      sub="How your emails, subscribers, coupons and forms are doing."
      actions={<PillLink href="/home/marketing/campaigns" icon="send">Campaigns</PillLink>}
    >
      <MarketingAnalytics />
    </SellerPage>
  );
}
