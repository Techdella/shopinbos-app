import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, FilterChips, StatGrid, StatTile } from "@/components/app-kit";
import { parseDiscountConfig } from "@/lib/discounts";
import { discountUsage } from "@/lib/marketing/discounts";
import { naira } from "@shared/onboarding";
import { DiscountsManager } from "./DiscountsManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Discounts" };

const TABS = [
  { key: "codes", label: "Codes" },
  { key: "automatic", label: "Automatic" },
  { key: "coupons", label: "One-use coupons" },
] as const;
type TabKey = (typeof TABS)[number]["key"];
const LEGACY: Record<string, TabKey> = { Discounts: "codes", "Coupon Codes": "coupons", "Sales Events": "automatic" };

export default async function SellerDiscountsPage({ searchParams }: { searchParams?: Promise<{ tab?: string; action?: string }> }) {
  const params = await searchParams;
  const tab: TabKey = TABS.find((t) => t.key === params?.tab)?.key ?? LEGACY[params?.tab ?? ""] ?? "codes";
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const [discounts, coupons, usage, segments, products] = store
    ? await Promise.all([
        db.discount.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" } }),
        db.coupon.findMany({ where: { storeId: store.id }, orderBy: { createdAt: "desc" }, take: 300 }),
        discountUsage(store.id),
        db.customerSegment.findMany({ where: { storeId: store.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
        db.storeProduct.findMany({ where: { storeId: store.id, status: { not: "archived" } }, select: { id: true, name: true }, orderBy: { name: "asc" }, take: 500 }),
      ])
    : [[], [], new Map<string, { orders: number; revenue: number; given: number }>(), [], []];

  const rows = discounts.map((d) => {
    const config = parseDiscountConfig(d.config);
    const used = usage.get(d.code.toUpperCase());
    return {
      id: d.id,
      name: d.name,
      code: d.code,
      type: d.type,
      value: d.value,
      minOrder: d.minOrder,
      maxUses: d.maxUses,
      usedCount: d.usedCount,
      startsAt: d.startsAt?.toISOString() ?? null,
      expiresAt: d.expiresAt?.toISOString() ?? null,
      status: d.status,
      config,
      orders: used?.orders ?? 0,
      revenue: used?.revenue ?? 0,
      given: used?.given ?? 0,
    };
  });
  const totals = [...usage.values()].reduce((sum, row) => ({ orders: sum.orders + row.orders, revenue: sum.revenue + row.revenue, given: sum.given + row.given }), { orders: 0, revenue: 0, given: 0 });
  const automatic = rows.filter((r) => r.config.automatic);
  const codes = rows.filter((r) => !r.config.automatic);

  return (
    <SellerPage user={user} store={storeSummary(store)} title="Discounts and coupons" sub="Codes, automatic offers and one-use coupons, with what each one brought in.">
      <div className="grid gap-5">
        <StatGrid>
          <StatTile tone="card" label="Live offers" value={rows.filter((r) => r.status === "active").length} hint={`${automatic.filter((r) => r.status === "active").length} automatic`} />
          <StatTile tone="card" label="Paid orders with a code" value={totals.orders.toLocaleString("en-NG")} />
          <StatTile tone="card" label="Sales with a code" value={naira(totals.revenue)} />
          <StatTile tone="card" label="Given away" value={naira(totals.given)} />
        </StatGrid>
        <FilterChips
          items={TABS.map((t) => ({
            label: t.label,
            href: `/home/discounts?tab=${t.key}`,
            count: t.key === "codes" ? codes.length : t.key === "automatic" ? automatic.length : coupons.length,
            active: t.key === tab,
          }))}
        />
        <DiscountsManager
          tab={tab}
          startOpen={params?.action === "new"}
          discounts={tab === "automatic" ? automatic : codes}
          coupons={coupons.map((c) => {
            const used = usage.get(c.code.toUpperCase());
            return { id: c.id, code: c.code, type: c.type, value: c.value, minOrder: c.minOrder, maxUses: c.maxUses, usedCount: c.usedCount, expiresAt: c.expiresAt?.toISOString() ?? null, status: c.status, revenue: used?.revenue ?? 0 };
          })}
          segments={segments}
          products={products}
        />
        <AssistantNote>
          {tab === "automatic"
            ? "Automatic offers apply at checkout without a code, like a weekend sale or buy 2 get 1 free. Only the best one applies to an order."
            : "Discounts with an end date make people decide faster. Try a 24-hour code and share it on WhatsApp."}
        </AssistantNote>
      </div>
    </SellerPage>
  );
}
