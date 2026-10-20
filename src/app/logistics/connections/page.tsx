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
import { readRateRows, startingPrice } from "@shared/delivery-market";
import { podDisclaimerPartner } from "@/components/delivery-market/words";
import { getT } from "@/lib/i18n/server";

// Businesses (shops and suppliers) that added this partner as a delivery partner: since when, what their customers
// can pick, pay on delivery per business, private rates (sent, accepted, withdrawn) and ending the connection.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("market.conn.title") };
}

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
  const t = await getT("logistics", "delivery", "common");

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("market.conn.title")}
      sub={t("market.conn.sub")}
      actions={<PillLink href="/logistics/rates" icon="coin">{t("market.conn.publicCard")}</PillLink>}
    >
      <ActionNotice saved={saved} error={error} savedText={saved === "rates" ? t("market.conn.ratesSent") : t("kit.saved")} />
      {!verified && (
        <div className="mb-4">
          <Notice tone="info">{t("market.conn.verifyFirst")} <TextLink href="/logistics/verification">{t("market.conn.finishVerification")}</TextLink></Notice>
        </div>
      )}

      {connections.length === 0 ? (
        <EmptyState icon="users" title={t("market.conn.emptyTitle")}>
          {t("market.conn.emptyBody")}
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
                      <Pill>{connection.ownerRole === "supplier" ? t("market.conn.supplier") : t("market.conn.shop")}</Pill>
                      {connection.ownerPod && connection.partnerPod && partner.offersPayOnDelivery && <Pill tone="warning">{t("market.conn.podOn")}</Pill>}
                    </div>
                    <p className="m-0 mt-0.5 text-[15px] text-app-ink-soft">
                      {t("market.conn.since", { date: lagosDate(connection.createdAt, { day: "numeric", month: "short", year: "numeric" }, new Date(), t) })}
                      {connection.services.length ? ` · ${t("market.conn.customersCanPick", { services: connection.services.map((service) => t.dynamic(`market.conn.offered.${service}`, OFFERED[service] ?? service)).join(", ") })}` : ""}
                    </p>
                    {connection.privateCards.length > 0 && (
                      <ul className="m-0 mt-2 grid list-none gap-1.5 p-0">
                        {connection.privateCards.map((card) => {
                          const full = cardById.get(card.id);
                          const from = full ? startingPrice(full.rows) : null;
                          return (
                            <li key={card.id} className="flex flex-wrap items-center gap-2 text-[15px]">
                              <Pill tone={card.status === "accepted" ? "success" : "accent"} dot>{card.status === "accepted" ? t("market.conn.privateInUse") : t("market.conn.privateWaiting")}</Pill>
                              <span className="text-app-ink-soft">
                                {t("market.conn.sent", { date: lagosDate(card.createdAt, undefined, new Date(), t) })}{full ? ` · ${t("market.editor.rateCount", { count: full.rows.length })}` : ""}{from !== null ? ` · ${t("market.conn.fromPrice", { amount: naira(from) })}` : ""}
                              </span>
                              <form action={withdrawPartnerPrivateRates}>
                                <input type="hidden" name="cardId" value={card.id} />
                                <SubmitButton tone="white" size="sm" className="min-h-[34px]">{t("market.conn.withdraw")}</SubmitButton>
                              </form>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                  <PillLink href={messagesHref("logistics_partner", { with: connection.ownerUserId })} size="sm" icon="chat">{t("market.conn.message")}</PillLink>
                </div>

                <div className="mt-3 grid gap-3 sm:pl-14">
                  <form action={setPartnerConnectionPod} className="flex flex-wrap items-center gap-2">
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <input type="hidden" name="on" value={podOn ? "0" : "1"} />
                    <span className="text-[15px] text-app-ink-soft">
                      {!partner.offersPayOnDelivery
                        ? t("market.conn.podOffAll")
                        : podOn
                          ? connection.ownerPod ? t("market.conn.podYouCollect") : t("market.conn.podWaiting")
                          : t("market.conn.podNotForThem")}
                    </span>
                    {partner.offersPayOnDelivery ? (
                      <SubmitButton tone="white" size="sm">{podOn ? t("market.conn.podStop") : t("market.conn.podAllow")}</SubmitButton>
                    ) : (
                      <TextLink href="/logistics/coverage#where-you-work">{t("market.turnOnInCoverage")}</TextLink>
                    )}
                  </form>

                  <details className="group">
                    <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink [&::-webkit-details-marker]:hidden">
                      {t("market.conn.sendPrivate")} <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
                    </summary>
                    <div className="mt-3 rounded-[16px] border border-app-line bg-white p-4">
                      <p className="m-0 mb-3 text-[15px] text-app-ink-soft">
                        {t("market.conn.privateIntro", { name: connection.businessName })}
                        {latest?.status === "proposed" ? ` ${t("market.conn.replaces")}` : ""}
                      </p>
                      <RateCardEditor
                        action={sendPartnerPrivateRates}
                        ownerUserId={connection.ownerUserId}
                        initialRows={startRows}
                        failedAttemptFee={latestCard?.failedAttemptFee ?? publicCard?.failedAttemptFee ?? 0}
                        returnFee={latestCard?.returnFee ?? publicCard?.returnFee ?? 0}
                        notes={latestCard?.notes ?? publicCard?.notes ?? ""}
                        submitLabel={t("market.conn.sendPrivate")}
                      />
                    </div>
                  </details>

                  <details className="group">
                    <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
                      {t("market.conn.end")} <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
                    </summary>
                    <form action={endPartnerConnection} className="mt-2 flex flex-wrap items-center gap-2">
                      <input type="hidden" name="connectionId" value={connection.id} />
                      <span className="text-[15px] text-app-ink-soft">{t("market.conn.endBody", { name: connection.businessName })}</span>
                      <SubmitButton tone="white" size="sm">{t("market.conn.end")}</SubmitButton>
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
          <CardHead title={t("market.conn.aboutPod")} />
          <p className="m-0 mt-2 text-[15px] leading-[1.5] text-app-ink-soft">{podDisclaimerPartner(t)} {t("market.conn.aboutPodAfter")}</p>
        </Card>
      )}
    </PartnerPage>
  );
}
