import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getSellerAffiliates } from "@/lib/affiliates";
import { nextPayday } from "@shared/affiliates";
import { AffiliatesManager } from "./AffiliatesManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Affiliates" };

export default async function AffiliatesPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  const affiliates = store ? await getSellerAffiliates(store) : [];
  const payday = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "short" }).format(nextPayday());

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Creators and affiliates"
      sub="Give a creator their own link. When someone buys through it and the order is delivered, they earn a share. You pay them, we keep the count."
    >
      <AffiliatesManager
        storeName={store?.name ?? "my shop"}
        payday={payday}
        affiliates={affiliates.map((affiliate) => ({
          id: affiliate.id,
          name: affiliate.name,
          phone: affiliate.phone,
          code: affiliate.code,
          link: affiliate.link,
          commissionRate: affiliate.commissionRate,
          active: affiliate.active,
          totals: affiliate.totals,
          recentOrders: affiliate.recentOrders.map((order) => ({
            id: order.id,
            orderNumber: order.orderNumber,
            buyerName: order.buyerName,
            status: order.status,
            commission: Number(order.affiliateCommission) || 0,
            paid: Boolean(order.affiliatePaidAt),
          })),
        }))}
      />
    </SellerPage>
  );
}
