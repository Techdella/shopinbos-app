import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, MoreActions, PillLink } from "@/components/app-kit";
import { loadGameConfig } from "@/lib/gamification/config.server";
import { gameStats } from "@/lib/gamification/stats.server";
import { GAME_SECTION_KINDS } from "@/lib/gamification/logic";
import { freeDeliveryEverywhereOver, summariseDeliveryZones } from "@/lib/storefront/shopper-info";
import { resolveShopperTheme } from "@/components/storefront/shopper/theme";
import { shopperGameColors } from "@/components/storefront/gamification/client";
import { RewardsManager } from "./RewardsManager";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("hub.tool.rewards") };
}

// Marketing > Rewards: spin the wheel, scratch card, reward progress, loyalty points and the post-purchase
// spin, each with an on/off switch, settings, a live preview in the store's colours, and 30-day numbers.

export default async function RewardsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing");
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
      title={t("hub.tool.rewards")}
      sub={t("rewards.sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/discounts" icon="percent">{t("rewards.discounts")}</PillLink>
            <PillLink href="/builder/editor" icon="edit">{t("rewards.storeBuilder")}</PillLink>
          </MoreActions>
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
        <AssistantNote>{t("rewards.note")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
