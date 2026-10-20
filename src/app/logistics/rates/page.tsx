import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { rateCardsForPartner } from "@/lib/delivery-market/manage.server";
import { savePartnerRateCard } from "@/app/actions/delivery-market-partner";
import { Card, CardHead, PillLink, TextLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { RateCardEditor } from "@/components/logistics/RateCardEditor";
import { ActionNotice, KeyValue, PartnerPage, lagosDate, naira } from "@/components/logistics/kit";
import { NG_REGIONS, canonicalState, cardTimeframe, startingPrice } from "@shared/delivery-market";
import { timeframeText } from "@/components/delivery-market/words";
import { getT } from "@/lib/i18n/server";

// The partner's public rate card (logistics marketplace): the prices shops are charged at checkout, by route,
// service and parcel size. Saving publishes a new card; orders already placed keep the price they got.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("market.rates.title") };
}

export default async function LogisticsRatesPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const { publicCard, retiredCount } = await rateCardsForPartner(partner.id);
  const rows = publicCard?.rows ?? [];
  const from = startingPrice(rows);
  const timeframe = cardTimeframe(rows);
  const defaultFrom = partner.pickupAreas[0] ?? canonicalState(partner.city) ?? "";
  const t = await getT("logistics", "delivery", "common");

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("market.rates.title")}
      sub={t("market.rates.sub")}
      actions={
        <>
          <PillLink href="/logistics/coverage#where-you-work" icon="pin">{t("market.whereYouWork")}</PillLink>
          <PillLink href="/logistics/pickup-points" icon="shop">{t("market.points.title")}</PillLink>
        </>
      }
    >
      <ActionNotice saved={saved} error={error} savedText={t("market.rates.saved")} />
      <div className="mb-4">
        <Notice tone="info">{t("market.rates.newOrdersOnly")}</Notice>
      </div>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_340px]">
        <Card className="min-w-0 p-5">
          <CardHead
            title={publicCard ? t("market.rates.yourRates") : t("market.rates.setUp")}
            sub={publicCard ? t("market.rates.lastSaved", { date: lagosDate(publicCard.createdAt, undefined, new Date(), t) }) : t("market.rates.setUpSub")}
          />
          <div className="mt-4">
            <RateCardEditor
              action={savePartnerRateCard}
              initialRows={rows}
              failedAttemptFee={publicCard?.failedAttemptFee ?? 0}
              returnFee={publicCard?.returnFee ?? 0}
              notes={publicCard?.notes ?? ""}
              defaultFrom={defaultFrom}
              submitLabel={publicCard ? t("market.rates.saveNew") : t("market.rates.publish")}
            />
          </div>
        </Card>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title={t("market.rates.whatBusinessesSee")} />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label={t("market.rates.from")}>{from !== null ? naira(from) : t("market.rates.noRates")}</KeyValue>
              <KeyValue label={t("market.rates.deliveryTime")}>{timeframeText(t, timeframe) ?? "—"}</KeyValue>
              <KeyValue label={t("market.rates.count")}>{rows.length}</KeyValue>
              {retiredCount > 0 && <KeyValue label={t("market.rates.earlierCards")}>{retiredCount}</KeyValue>}
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title={t("market.rates.howToWrite")} />
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[15px] leading-[1.5]">
              <li><b>{t("market.rates.aState")}</b>: Lagos, Oyo, FCT (Abuja)</li>
              <li><b>{t("market.rates.anArea")}</b>: Lagos: Ikeja, FCT: Wuse</li>
              <li><b>{t("market.rates.aRegion")}</b>: {Object.keys(NG_REGIONS).join(", ")}</li>
              <li><b>{t("market.rates.everywhere")}</b>: Nationwide</li>
            </ul>
            <p className="m-0 mt-3 text-[15px] leading-[1.5] text-app-ink-soft">
              {t("market.rates.closestWins")}
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title={t("market.rates.sizesAndDays")} />
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[15px] leading-[1.5] text-app-ink-soft">
              <li><b className="text-app-ink">{t("market.rates.small")}</b>: {t("market.rates.smallUpTo")} <b className="text-app-ink">{t("market.rates.medium")}</b>: {t("market.rates.mediumRange")} <b className="text-app-ink">{t("market.rates.bulky")}</b>: {t("market.rates.bulkyOver")}</li>
              <li>{t("market.rates.sizeRule")}</li>
              <li>{t("market.rates.daysRule")}</li>
            </ul>
            <div className="mt-3"><TextLink href="/logistics/connections">{t("market.rates.sendPrivate")}</TextLink></div>
          </Card>
        </div>
      </div>
    </PartnerPage>
  );
}
