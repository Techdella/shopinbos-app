import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, PillLink } from "@/components/app-kit";
import { loadGameConfig } from "@/lib/gamification/config.server";
import { gameStats } from "@/lib/gamification/stats.server";
import { GAME_SECTION_KINDS } from "@/lib/gamification/logic";
import { freeDeliveryEverywhereOver, summariseDeliveryZones } from "@/lib/storefront/shopper-info";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { shopperGameColors } from "@/components/storefront/gamification/client";
import { RewardsManager } from "./RewardsManager";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rewards and games" };

// Marketing > Rewards: spin the wheel, scratch card, reward progress, loyalty points and the post-purchase
// spin, each with an on/off switch, settings, a live preview in the store's colours, and 30-day numbers.

export default async function RewardsPage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true, brandSettings: true } });
  if (!store) redirect("/onboarding");

  const [config, stats, products, zones] = await Promise.all([
    loadGameConfig(store.id),
    gameStats(store.id),
    db.storeProduct.findMany({ where: { storeId: store.id, status: "published" }, orderBy: { updatedAt: "desc" }, take: 200, select: { id: true, name: true, retailPrice: true } }),
    db.shippingZone.findMany({ where: { storeId: store.id, active: true }, select: { name: true, regions: true, rates: true } }),
  ]);
  const freeOver = freeDeliveryEverywhereOver(summariseDeliveryZones(zones.map((zone) => ({ name: zone.name ?? "", regions: zone.regions, rates: zone.rates }))));
  // Which reward sections the published store already shows (placed in the builder).
  const editor = JSON.stringify((store.brandSettings as Record<string, unknown> | null)?.editor ?? {});
  const placed = GAME_SECTION_KINDS.filter((kind) => editor.includes(`"kind":"${kind}"`));

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Rewards and games"
      sub="Spin the wheel, scratch cards, reward progress and loyalty points. Real discounts, fair odds, never in the way of checkout."
      actions={
        <>
          <PillLink href="/home/discounts" icon="percent">Discounts</PillLink>
          <PillLink href="/builder/editor" icon="edit">Store builder</PillLink>
        </>
      }
    >
      <div className="grid gap-5">
        <RewardsManager
          initial={config}
          stats={stats}
          products={products}
          currency={store.currency}
          storeSlug={store.slug}
          freeDeliveryOver={freeOver}
          placed={placed}
          colors={shopperGameColors(resolveShopperTheme(store.brandSettings))}
        />
        <AssistantNote>Small, frequent wins work best: a few 5–10% slices, free delivery, and an honest &ldquo;try again&rdquo;. Every prize is a one-use code that expires, so it can&apos;t be shared around.</AssistantNote>
      </div>
    </SellerPage>
  );
}
