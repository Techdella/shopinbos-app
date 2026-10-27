import Link from "next/link";
import { Card, CardHead, EmptyState, Pill, PillLink, Thumb } from "@/components/app-kit";
import { field, pillButton } from "@/components/seller-core";
import { messagesHref } from "@/lib/conversations/pure";
import { OFFER_SERVICES } from "@shared/delivery-market";
import { getT } from "@/lib/i18n/server";
import type { connectionsForOwner, privateCardsForOwner } from "@/lib/delivery-market/manage.server";
import { endConnectionAction, respondRateCardAction, updateConnectionAction } from "@/app/actions/delivery-market";
import { CardExtras, PartnerBadges, RateTable } from "./bits";
import { podDisclaimer, serviceLabel } from "./words";
import { Term } from "@/components/learn/Term";

// "My delivery partners" and private rates waiting for an answer, for sellers and suppliers.

type Connection = Awaited<ReturnType<typeof connectionsForOwner>>[number];
type PrivateCard = Awaited<ReturnType<typeof privateCardsForOwner>>[number];

export async function PodStatus({ connection }: { connection: Pick<Connection, "partnerPod" | "logisticsPartner"> }) {
  const t = await getT("delivery");
  if (!connection.logisticsPartner.offersPayOnDelivery) return <Pill tone="muted">{t("pod.partnerDoesNotOffer")}</Pill>;
  if (!connection.partnerPod) return <Pill tone="warning">{t("pod.waitingForPartner")}</Pill>;
  return <Pill tone="success">{t("pod.partnerCollects")}</Pill>;
}

export async function MyPartners({
  role,
  connections,
  cards,
  detailBase,
  back,
  findHref,
}: {
  role: "seller" | "supplier";
  connections: Connection[];
  cards: PrivateCard[];
  /** "/home/logistics/partners" or "/supplier/delivery/partners". */
  detailBase: string;
  /** Where forms come back to. */
  back: string;
  findHref: string;
}) {
  const t = await getT("delivery");
  const pending = cards.filter((card) => card.status === "proposed");
  return (
    <section id="my-partners" className="grid scroll-mt-24 gap-4">
      {pending.length > 0 && (
        <Card className="p-5">
          <CardHead title={<Term k="private-rates">{t("mine.privateTitle")}</Term>} sub={t("mine.privateSub")} />
          <div className="mt-4 grid gap-5">
            {pending.map((card) => (
              <div key={card.id} className="grid gap-3 rounded-[16px] bg-app-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`${detailBase}/${card.logisticsPartner.slug}`} className="text-[15px] font-extrabold text-app-ink no-underline hover:underline">{card.logisticsPartner.displayName}</Link>
                  <Pill tone="warning">{t("mine.waitingForYou")}</Pill>
                </div>
                <RateTable rows={card.rows} />
                <CardExtras card={card} />
                <form action={respondRateCardAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="cardId" value={card.id} />
                  <input type="hidden" name="back" value={`${back}#my-partners`} />
                  <button type="submit" name="decision" value="accept" className={pillButton.ink}>{t("mine.acceptRates")}</button>
                  <button type="submit" name="decision" value="decline" className={pillButton.white}>{t("mine.decline")}</button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">{t("mine.title")}</h2>
          <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">
            {role === "seller" ? t("mine.subSeller") : t("mine.subSupplier")}
          </p>
        </div>
        <PillLink href={findHref} size="sm" icon="search">{t("find.title")}</PillLink>
      </div>

      {connections.length === 0 ? (
        <EmptyState icon="truck" title={t("mine.emptyTitle")}>
          {t("mine.emptyBody")}
        </EmptyState>
      ) : (
        <div className="grid gap-4">
          {connections.map((connection) => {
            const partner = connection.logisticsPartner;
            const accepted = cards.find((card) => card.status === "accepted" && card.logisticsPartner.id === partner.id);
            const offered = (OFFER_SERVICES as readonly string[]).filter((service) => partner.services.includes(service));
            return (
              <Card key={connection.id} className="p-5">
                <div className="flex flex-wrap items-center gap-3">
                  <Thumb src={partner.logoUrl} label={partner.displayName} size={44} />
                  <div className="min-w-0 flex-1">
                    <Link href={`${detailBase}/${partner.slug}`} className="text-[15.5px] font-extrabold text-app-ink no-underline hover:underline">{partner.displayName}</Link>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <PartnerBadges status={partner.verificationStatus} badges={partner.badges} />
                      {accepted ? <Pill tone="info">{t("mine.yourPrivateRates")}</Pill> : <Pill tone="muted">{t("mine.publicRates")}</Pill>}
                      {role === "seller" && <PodStatus connection={connection} />}
                    </div>
                  </div>
                  <PillLink href={messagesHref(role, { with: partner.userId })} size="sm" icon="chat">{t("chat")}</PillLink>
                </div>

                {role === "seller" ? (
                  <form action={updateConnectionAction} className="mt-4 grid gap-4 border-t border-app-line pt-4">
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <input type="hidden" name="back" value={`${back}#my-partners`} />
                    <fieldset className="m-0 grid gap-2 border-0 p-0">
                      <legend className={field.label}>{t("mine.offerCustomers")}</legend>
                      <div className="flex flex-wrap gap-4">
                        {OFFER_SERVICES.map((service) => {
                          const available = offered.includes(service);
                          return (
                            <label key={service} className={`flex items-center gap-2 text-[14px] ${available ? "" : "text-app-ink-faint"}`}>
                              <input type="checkbox" name="services" value={service} defaultChecked={connection.services.includes(service) && available} disabled={!available} className={field.checkbox} />
                              {serviceLabel(t, service)}{available ? "" : ` ${t("mine.notOffered")}`}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    <fieldset className="m-0 grid gap-2 border-0 p-0">
                      <legend className={field.label}>{t("mine.atCheckoutShow")}</legend>
                      <label className="flex items-center gap-2 text-[14px]">
                        <input type="radio" name="showPartnerName" value="true" defaultChecked={connection.showPartnerName} className={field.checkbox} />
                        {t("mine.partnerName", { name: partner.displayName })}
                      </label>
                      <label className="flex flex-wrap items-center gap-2 text-[14px]">
                        <input type="radio" name="showPartnerName" value="false" defaultChecked={!connection.showPartnerName} className={field.checkbox} />
                        {t("mine.ownLabel")}
                        <input name="label" defaultValue={connection.label ?? ""} maxLength={40} placeholder={t("mine.ownLabelPlaceholder")} className={`${field.input} h-10 w-[220px]`} aria-label={t("mine.ownLabelAria")} />
                      </label>
                    </fieldset>

                    <fieldset className="m-0 grid gap-2 border-0 p-0">
                      <legend className={field.label}><Term k="cod">{t("pod.title")}</Term></legend>
                      <label className="flex items-center gap-2 text-[14px]">
                        <input type="checkbox" name="ownerPod" defaultChecked={connection.ownerPod} className={field.checkbox} />
                        {t("pod.letCustomersPay")}
                      </label>
                      {!connection.podAcceptedAt && (
                        <div className="grid gap-2 rounded-[14px] bg-app-canvas p-3.5">
                          <p className="m-0 text-[13.5px] leading-[1.5]">{podDisclaimer(t)}</p>
                          <label className="flex items-center gap-2 text-[13.5px] font-bold">
                            <input type="checkbox" name="acceptPodDisclaimer" className={field.checkbox} />
                            {t("pod.iUnderstand")}
                          </label>
                        </div>
                      )}
                      <p className="m-0 text-[12.5px] text-app-ink-soft">
                        {t("pod.bothOn")}
                        {connection.ownerPod && !connection.partnerPod ? ` ${t("pod.waitingSwitchOn")}` : ""}
                      </p>
                    </fieldset>

                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className={pillButton.ink}>{t("save")}</button>
                    </div>
                  </form>
                ) : null}

                <form action={endConnectionAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="connectionId" value={connection.id} />
                  <input type="hidden" name="back" value={`${back}#my-partners`} />
                  <button type="submit" className={pillButton.danger}>{t("removePartner")}</button>
                </form>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
