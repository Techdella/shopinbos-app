import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, FilterChips } from "@/components/app-kit";
import { DiscountsManager } from "./DiscountsManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Discounts" };

const TABS = ["Discounts", "Coupon Codes", "Sales Events"] as const;
const TAB_LABEL: Record<(typeof TABS)[number], string> = { Discounts: "Discounts", "Coupon Codes": "Coupon codes", "Sales Events": "Sales events" };

export default async function SellerDiscountsPage({ searchParams }: { searchParams?: Promise<{ tab?: string; action?: string }> }) {
  const params = await searchParams;
  const tab = (TABS as readonly string[]).includes(params?.tab ?? "") ? (params!.tab as (typeof TABS)[number]) : "Discounts";
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const [discounts, coupons] = store
    ? await Promise.all([
        db.discount.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } }),
        db.coupon.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } }),
      ])
    : [[], []];

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Discounts and coupons" sub="Codes and offers that bring shoppers back.">
      <div className="grid gap-5">
        <FilterChips
          items={TABS.map((item) => ({
            label: TAB_LABEL[item],
            href: `/home/discounts?tab=${encodeURIComponent(item)}`,
            count: item === "Discounts" ? discounts.length : item === "Coupon Codes" ? coupons.length : undefined,
            active: item === tab,
          }))}
        />
        <DiscountsManager
          tab={tab}
          startOpen={params?.action === "new"}
          discounts={discounts.map((d) => ({
            id: d.id, name: d.name, code: d.code, type: d.type, value: d.value, minOrder: d.minOrder, maxUses: d.maxUses, usedCount: d.usedCount,
            expiresAt: d.expiresAt?.toISOString() ?? null, status: d.status,
          }))}
          coupons={coupons.map((c) => ({
            id: c.id, code: c.code, type: c.type, value: c.value, minOrder: c.minOrder, maxUses: c.maxUses, usedCount: c.usedCount,
            expiresAt: c.expiresAt?.toISOString() ?? null, status: c.status,
          }))}
        />
        <AssistantNote>Discounts with an end date make people decide faster. Try a 24-hour code and share it on WhatsApp to see what your customers respond to.</AssistantNote>
      </div>
    </SellerPage>
  );
}
