import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { connectionsForPartner, rateCardsForPartner } from "@/lib/delivery-market/manage.server";
import {
  endPartnerConnection,
  sendPartnerPrivateRates,
  setPartnerConnectionPod,
  withdrawPartnerPrivateRates,
} from "@/app/actions/delivery-market-partner";
import { Card, CardHead, EmptyState, ListCard, Pill, PillLink, TextLink } from "@/components/app-kit";
import { Notice } from "@/components/app-ui";
import { Icon } from "@/components/ui/Icon";
import { RateCardEditor } from "@/components/logistics/RateCardEditor";
import { ActionNotice, PartnerPage, SubmitButton, lagosDate, naira } from "@/components/logistics/kit";
import { messagesHref } from "@/lib/conversations/pure";
import { POD_DISCLAIMER, readRateRows, startingPrice } from "@shared/delivery-market";

// Businesses (shops and suppliers) that added this partner as a delivery partner: since when, what their customers
// can pick, pay on delivery per business, private rates (sent, accepted, withdrawn) and ending the connection.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Connections" };

const OFFERED: Record<string, string> = { doorstep: "Doorstep", pickup_point: "Pickup points" };

export default async function LogisticsConnectionsPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const [connections, { publicCard }] = await Promise.all([connectionsForPartner(partner.id), rateCardsForPartner(partner.id)]);
  const cardIds = connections.flatMap((connection) => connection.privateCards.map((card) => card.id));
  const cards = cardIds.length
    ? await db.logisticsRateCard.findMany({ where: { id: { in: cardIds }, logisticsPartnerId: partner.id }, select: { id: true, rows: true, failedAttemptFee: true, returnFee: true, notes: true } })
    : [];
  const cardById = new Map(cards.map((card) => [card.id, { ...card, rows: readRateRows(card.rows) }]));
  const verified = partner.verificationStatus === "verified";

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Connections"
      sub="Businesses that added you as their delivery partner. Their orders come to you as jobs."
      actions={<PillLink href="/logistics/rates" icon="coin">Public rate card</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText={saved === "rates" ? "Private rates sent. They're used once the business accepts them." : "Saved."} />
      {!verified && (
        <div className="mb-4">
          <Notice tone="info">Businesses can find and add you once you&apos;re verified. <TextLink href="/logistics/verification">Finish verification</TextLink></Notice>
        </div>
      )}

      {connections.length === 0 ? (
        <EmptyState icon="users" title="No businesses yet">
          When a shop or supplier adds you as a delivery partner, they show here. A full rate card, clear coverage and pickup points help them pick you.
        </EmptyState>
      ) : (
        <ListCard>
          {connections.map((connection) => {
            const latest = connection.privateCards[0];
            const latestCard = latest ? cardById.get(latest.id) : undefined;
            const startRows = latestCard?.rows.length ? latestCard.rows : (publicCard?.rows ?? []);
            const podOn = connection.partnerPod && partner.offersPayOnDelivery;
            return (
              <li key={connection.id} className="px-4 py-4 sm:px-5">
                <div className="flex flex-wrap items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-app-ink-soft"><Icon name={connection.ownerRole === "supplier" ? "box" : "shop"} size={18} /></span>
                  <div className="min-w-0 flex-1 basis-[220px]">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-[15px] font-extrabold">{connection.businessName}</span>
                      <Pill>{connection.ownerRole === "supplier" ? "Supplier" : "Shop"}</Pill>
                      {connection.ownerPod && connection.partnerPod && partner.offersPayOnDelivery && <Pill tone="warning">Pay on delivery on</Pill>}
                    </div>
                    <p className="m-0 mt-0.5 text-[15px] text-app-ink-soft">
                      Since {lagosDate(connection.createdAt, { day: "numeric", month: "short", year: "numeric" })}
                      {connection.services.length ? ` · Customers can pick: ${connection.services.map((service) => OFFERED[service] ?? service).join(", ")}` : ""}
                    </p>
                    {connection.privateCards.length > 0 && (
                      <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
                        {connection.privateCards.map((card) => {
                          const full = cardById.get(card.id);
                          const from = full ? startingPrice(full.rows) : null;
                          return (
                            <li key={card.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                              <Pill tone={card.status === "accepted" ? "success" : "accent"} dot>{card.status === "accepted" ? "Private rates in use" : "Private rates waiting for them"}</Pill>
                              <span className="text-app-ink-soft">
                                Sent {lagosDate(card.createdAt)}{full ? ` · ${full.rows.length} ${full.rows.length === 1 ? "rate" : "rates"}` : ""}{from !== null ? ` · from ${naira(from)}` : ""}
                              </span>
                              <form action={withdrawPartnerPrivateRates}>
                                <input type="hidden" name="cardId" value={card.id} />
                                <SubmitButton tone="white" size="sm" className="min-h-[34px]">Withdraw</SubmitButton>
                              </form>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <PillLink href={messagesHref("logistics_partner", { with: connection.ownerUserId })} size="sm" icon="chat">Message</PillLink>
                </div>

                <div className="mt-3 grid gap-3 sm:pl-14">
                  <form action={setPartnerConnectionPod} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <input type="hidden" name="on" value={podOn ? "0" : "1"} />
                    <span className="text-[15px] text-app-ink-soft">
                      {!partner.offersPayOnDelivery
                        ? "Pay on delivery is off for all businesses."
                        : podOn
                          ? connection.ownerPod ? "You collect pay-on-delivery cash for them." : "You allow pay on delivery. They haven't switched it on yet."
                          : "You don't collect pay-on-delivery cash for them."}
                    </span>
                    {partner.offersPayOnDelivery ? (
                      <SubmitButton tone="white" size="sm">{podOn ? "Stop pay on delivery" : "Allow pay on delivery"}</SubmitButton>
                    ) : (
                      <TextLink href="/logistics/coverage#where-you-work">Turn it on in Coverage</TextLink>
                    )}
                  </form>

                  <details className="group">
                    <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink [&::-webkit-details-marker]:hidden">
                      Send private rates <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-3 rounded-[16px] border border-app-line bg-white p-4">
                      <p className="m-0 mb-3 text-[15px] text-app-ink-soft">
                        Special prices for {connection.businessName} only, for example after agreeing a price in chat. They&apos;re used once {connection.businessName} accepts them, and apply to new orders only.
                        {latest?.status === "proposed" ? " Sending new rates replaces the ones waiting for them." : ""}
                      </p>
                      <RateCardEditor
                        action={sendPartnerPrivateRates}
                        ownerUserId={connection.ownerUserId}
                        initialRows={startRows}
                        failedAttemptFee={latestCard?.failedAttemptFee ?? publicCard?.failedAttemptFee ?? 0}
                        returnFee={latestCard?.returnFee ?? publicCard?.returnFee ?? 0}
                        notes={latestCard?.notes ?? publicCard?.notes ?? ""}
                        submitLabel="Send private rates"
                      />
                    </div>
                  </details>

                  <details className="group">
                    <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
                      End connection <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
                    </summary>
                    <form action={endPartnerConnection} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="connectionId" value={connection.id} />
                      <span className="text-[15px] text-app-ink-soft">New orders from {connection.businessName} stop coming to you. Jobs you already have carry on.</span>
                      <SubmitButton tone="white" size="sm">End connection</SubmitButton>
                    </form>
                  </details>
                </div>
              </li>
            );
          })}
        </ListCard>
      )}

      {partner.offersPayOnDelivery && connections.length > 0 && (
        <Card className="mt-5 p-5">
          <CardHead title="About pay on delivery" />
          <p className="m-0 mt-2 text-[15px] leading-[1.5] text-app-ink-soft">{POD_DISCLAIMER} After a delivery, pay the shop and mark it on the job.</p>
        </Card>
      )}
    </PartnerPage>
  );
}
