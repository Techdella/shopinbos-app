import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, MoreActions, PillLink } from "@/components/app-kit";
import { readDesign, readFields, readPopupConfig, rewardLabel, themeHeadingFont, type RewardKind } from "@/lib/marketing/forms";
import { formCodesUsed } from "@/lib/marketing/popup-rewards.server";
import { readFormMarker } from "@/lib/marketing/popup-rewards";
import { describeDiscount, parseDiscountConfig, redemptionError } from "@/lib/discounts";
import { readStoreLook, toHex6 } from "@/app/home/store/look";
import { FormsManager, type ManagedForm } from "./FormsManager";
import type { DiscountOption, EditorExtras, EditorTheme } from "./PopupDesigner";
import { readGameConfig, sliceLabel, sliceOdds } from "@/lib/gamification/logic";
import { freeDeliveryEverywhereOver, summariseDeliveryZones } from "@/lib/storefront/shopper-info";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("marketing");
  return { title: t("reports.forms") };
}

function rewardText(reward: ReturnType<typeof readPopupConfig>["reward"], discounts: DiscountOption[]) {
  if (!reward) return null;
  if (reward.source === "existing") return discounts.find((d) => d.id === reward.discountId)?.label ?? reward.code ?? null;
  return rewardLabel(reward);
}

export default async function FormsPage({ searchParams }: { searchParams?: Promise<{ edit?: string }> }) {
  const openId = (await searchParams)?.edit ?? null;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketing");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, status: true, brandSettings: true } });
  const since = new Date(Date.now() - 30 * 86_400_000);
  const [rows, stats, discountRows, zones] = store
    ? await Promise.all([
        // Contact and enquiry forms live with form messages (/home/forms); this page is for growing the list.
        db.storeForm.findMany({ where: { storeId: store.id, OR: [{ isPopup: true }, { type: { in: ["newsletter", "lead", "waitlist", "popup"] } }] }, orderBy: { createdAt: "desc" }, take: 100 }),
        db.marketingFormStat.groupBy({ by: ["formId"], where: { storeId: store.id, day: { gte: since } }, _sum: { views: true, submissions: true } }),
        // Codes the seller can hand out: active, typed by shoppers, not someone's personal prize or sign-up code.
        db.discount.findMany({
          where: { storeId: store.id, status: "active", NOT: [{ code: { startsWith: "SPIN-" } }, { code: { startsWith: "SCRATCH-" } }, { code: { startsWith: "NEXT-" } }, { code: { startsWith: "BOX-" } }] },
          orderBy: { createdAt: "desc" },
          take: 300,
        }),
        db.shippingZone.findMany({ where: { storeId: store.id, active: true }, select: { name: true, regions: true, rates: true } }),
      ])
    : [[], [], [], []];

  // Game pop-ups use the prizes from Marketing > Rewards; free-delivery pop-ups start from the delivery settings.
  const games = readGameConfig((store?.brandSettings as Record<string, unknown> | null)?.gamification ?? {});
  const extras: EditorExtras = {
    prizes: { slices: games.prizes.slices.map((slice) => ({ id: slice.id, label: sliceLabel(slice) })), odds: sliceOdds(games.prizes.slices), codeDays: games.prizes.codeDays, minOrder: games.prizes.minOrder },
    storeFreeDeliveryOver: freeDeliveryEverywhereOver(summariseDeliveryZones(zones.map((zone) => ({ name: zone.name ?? "", regions: zone.regions, rates: zone.rates })))),
  };

  const discounts: DiscountOption[] = discountRows
    .filter((d) => !parseDiscountConfig(d.config).automatic && !readFormMarker(d.config)?.email && !redemptionError(d, Number.MAX_SAFE_INTEGER))
    .slice(0, 100)
    .map((d) => ({ id: d.id, code: d.code, label: describeDiscount(d), type: d.type as RewardKind, value: d.value, minOrder: d.minOrder ?? 0 }));

  const configs = new Map(rows.map((row) => [row.id, readPopupConfig(row.popupConfig)]));
  // Forms that make their own codes (one per person, or a shared one made here) can count how often they were used.
  const counted = rows.filter((row) => {
    const reward = configs.get(row.id)?.reward;
    return reward && reward.source === "new";
  });
  const used = store ? await formCodesUsed(store.id, counted.map((row) => row.id)) : new Map<string, number>();

  const tokens = store ? readStoreLook(store).tokens : null;
  const theme: EditorTheme = {
    ink: toHex6(tokens?.ink, "#16141F"),
    paper: toHex6(tokens?.paperBg, "#FFFFFF"),
    accent: toHex6(tokens?.ctaBg, "#16141F"),
    accentText: toHex6(tokens?.ctaText, "#FFFFFF"),
    heading: themeHeadingFont(tokens?.headingStyle),
    swatches: [tokens?.ctaBg, tokens?.ink, tokens?.paperBg, tokens?.heroBg, tokens?.accent, tokens?.cardBg].filter((c): c is string => Boolean(c)).map((c) => toHex6(c, "")).filter(Boolean),
  };

  const forms: ManagedForm[] = rows.map((row) => {
    const stat = stats.find((s) => s.formId === row.id);
    return {
      id: row.id,
      name: row.name,
      type: row.type,
      isPopup: row.isPopup,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      fields: readFields(row.fields),
      design: readDesign(row.design, row.name),
      config: configs.get(row.id)!,
      views: stat?._sum.views ?? 0,
      signups: stat?._sum.submissions ?? 0,
      codesUsed: counted.some((c) => c.id === row.id) ? (used.get(row.id) ?? 0) : null,
      rewardText: rewardText(configs.get(row.id)!.reward, discounts),
    };
  });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("reports.forms")}
      sub={t("forms.sub")}
      actions={
        <>
          <MoreActions>
            <PillLink href="/home/marketing/subscribers" icon="users">{t("hub.stat.subscribers")}</PillLink>
            <PillLink href="/home/forms" icon="message">{t("forms.formMessages")}</PillLink>
          </MoreActions>
        </>
      }
    >
      <div className="grid gap-5">
        <FormsManager forms={forms} storeSlug={store?.slug ?? ""} theme={theme} discounts={discounts} extras={extras} openId={openId} />
        <AssistantNote>{t("forms.note")}</AssistantNote>
      </div>
    </SellerPage>
  );
}
