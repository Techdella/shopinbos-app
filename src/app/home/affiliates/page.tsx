import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { getSellerAffiliates } from "@/lib/affiliates";
import { nextPayday } from "@shared/affiliates";
import { AffiliatesManager } from "./AffiliatesManager";
import { getLocale, getT } from "@/lib/i18n/server";
import { formatDate } from "@shared/i18n";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("affiliates");
  return { title: t("metaTitle") };
}

export default async function AffiliatesPage() {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("affiliates");
  const locale = await getLocale();
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, customDomain: true, logoUrl: true } });
  const affiliates = store ? await getSellerAffiliates(store) : [];
  const payday = locale === "en" ? new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", weekday: "long", day: "numeric", month: "short" }).format(nextPayday()) : formatDate(nextPayday(), locale, { weekday: "long", day: "numeric", month: "short" });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("title")}
      sub={t("sub")}
    >
      <PageTip className="mb-5">{tipT("affiliates")}</PageTip>
      <AffiliatesManager
        storeName={store?.name ?? t("myShop")}
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
