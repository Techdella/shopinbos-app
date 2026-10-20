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

// The partner's public rate card (logistics marketplace): the prices shops are charged at checkout, by route,
// service and parcel size. Saving publishes a new card; orders already placed keep the price they got.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Rate card" };

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

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Rate card"
      sub="Your prices by route, service and parcel size. Shops' customers see them at checkout."
      actions={
        <>
          <PillLink href="/logistics/coverage#where-you-work" icon="pin">Where you work</PillLink>
          <PillLink href="/logistics/pickup-points" icon="shop">Pickup points</PillLink>
        </>
      }
    >
      <ActionNotice saved={saved} error={error} savedText="Rate card saved. New orders use these prices." />
      <div className="mb-4">
        <Notice tone="info">New rates apply to new orders only. Orders already placed keep the price they were given.</Notice>
      </div>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_340px]">
        <Card className="min-w-0 p-5">
          <CardHead
            title={publicCard ? "Your rates" : "Set up your rates"}
            sub={publicCard ? `Last saved ${lagosDate(publicCard.createdAt)}.` : "Add a row for each route you carry. Start with your busiest one."}
          />
          <div className="mt-4">
            <RateCardEditor
              action={savePartnerRateCard}
              initialRows={rows}
              failedAttemptFee={publicCard?.failedAttemptFee ?? 0}
              returnFee={publicCard?.returnFee ?? 0}
              notes={publicCard?.notes ?? ""}
              defaultFrom={defaultFrom}
              submitLabel={publicCard ? "Save new rates" : "Publish rate card"}
            />
          </div>
        </Card>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title="What businesses see" />
            <div className="mt-2 divide-y divide-app-line">
              <KeyValue label="From">{from !== null ? naira(from) : "No rates yet"}</KeyValue>
              <KeyValue label="Delivery time">{timeframe ?? "—"}</KeyValue>
              <KeyValue label="Rates on your card">{rows.length}</KeyValue>
              {retiredCount > 0 && <KeyValue label="Earlier cards">{retiredCount}</KeyValue>}
            </div>
          </Card>

          <Card className="p-5">
            <CardHead title="How to write places" />
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[15px] leading-[1.5]">
              <li><b>A state</b>: Lagos, Oyo, FCT (Abuja)</li>
              <li><b>An area in a state</b>: Lagos: Ikeja, FCT: Wuse</li>
              <li><b>A region</b>: {Object.keys(NG_REGIONS).join(", ")}</li>
              <li><b>Everywhere</b>: Nationwide</li>
            </ul>
            <p className="m-0 mt-3 text-[15px] leading-[1.5] text-app-ink-soft">
              The closest match wins: an area beats its state, a state beats its region, and a region beats Nationwide. So you can set one Nationwide price and cheaper prices for the places you know well.
            </p>
          </Card>

          <Card className="p-5">
            <CardHead title="Sizes and days" />
            <ul className="m-0 mt-3 grid list-none gap-2 p-0 text-[15px] leading-[1.5] text-app-ink-soft">
              <li><b className="text-app-ink">Small</b>: up to 2kg. <b className="text-app-ink">Medium</b>: 2 to 10kg. <b className="text-app-ink">Bulky</b>: over 10kg.</li>
              <li>A parcel can use the price for its size or a bigger size, never a smaller one.</li>
              <li>Days count from when the order comes in. Same-day rates are 0 days.</li>
            </ul>
            <div className="mt-3"><TextLink href="/logistics/connections">Send private rates to one business</TextLink></div>
          </Card>
        </div>
      </div>
    </PartnerPage>
  );
}
