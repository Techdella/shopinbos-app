import Link from "next/link";
import { Card, CardHead, EmptyState, Pill, PillLink, Thumb } from "@/components/app-kit";
import { field, pillButton } from "@/components/seller-core";
import { messagesHref } from "@/lib/conversations/pure";
import { OFFER_SERVICES, POD_DISCLAIMER } from "@shared/delivery-market";
import type { connectionsForOwner, privateCardsForOwner } from "@/lib/delivery-market/manage.server";
import { endConnectionAction, respondRateCardAction, updateConnectionAction } from "@/app/actions/delivery-market";
import { CardExtras, RateTable, serviceWord, VerifiedPill } from "./bits";

// "My delivery partners" and private rates waiting for an answer, for sellers and suppliers.

type Connection = Awaited<ReturnType<typeof connectionsForOwner>>[number];
type PrivateCard = Awaited<ReturnType<typeof privateCardsForOwner>>[number];

export function PodStatus({ connection }: { connection: Pick<Connection, "partnerPod" | "logisticsPartner"> }) {
  if (!connection.logisticsPartner.offersPayOnDelivery) return <Pill tone="muted">Partner doesn&apos;t offer pay on delivery</Pill>;
  if (!connection.partnerPod) return <Pill tone="warning">Pay on delivery: waiting for partner</Pill>;
  return <Pill tone="success">Partner collects cash</Pill>;
}

export function MyPartners({
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
  const pending = cards.filter((card) => card.status === "proposed");
  return (
    <section id="my-partners" className="grid scroll-mt-24 gap-4">
      {pending.length > 0 && (
        <Card className="p-5">
          <CardHead title="Private rates for you" sub="A partner sent you their own prices. Accept them to use them for your deliveries with that partner." />
          <div className="mt-4 grid gap-5">
            {pending.map((card) => (
              <div key={card.id} className="grid gap-3 rounded-[16px] bg-app-canvas p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Link href={`${detailBase}/${card.logisticsPartner.slug}`} className="text-[15px] font-extrabold text-app-ink no-underline hover:underline">{card.logisticsPartner.displayName}</Link>
                  <Pill tone="warning">Waiting for you</Pill>
                </div>
                <RateTable rows={card.rows} />
                <CardExtras card={card} />
                <form action={respondRateCardAction} className="flex flex-wrap gap-2">
                  <input type="hidden" name="cardId" value={card.id} />
                  <input type="hidden" name="back" value={`${back}#my-partners`} />
                  <button type="submit" name="decision" value="accept" className={pillButton.ink}>Accept these rates</button>
                  <button type="submit" name="decision" value="decline" className={pillButton.white}>Decline</button>
                </form>
              </div>
            ))}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="m-0 text-[17px] font-extrabold">My delivery partners</h2>
          <p className="m-0 mt-0.5 text-[13px] text-app-ink-soft">
            {role === "seller" ? "Choose what customers see at checkout for each partner." : "Partners that carry your parcels when shops sell your products by dropship."}
          </p>
        </div>
        <PillLink href={findHref} size="sm" icon="search">Find partners</PillLink>
      </div>

      {connections.length === 0 ? (
        <EmptyState icon="truck" title="No delivery partners yet">
          Connect a partner below. Connecting is instant, at their public rates.
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
                      <VerifiedPill status={partner.verificationStatus} />
                      {accepted ? <Pill tone="info">Your private rates</Pill> : <Pill tone="muted">Public rates</Pill>}
                      {role === "seller" && <PodStatus connection={connection} />}
                    </div>
                  </div>
                  <PillLink href={messagesHref(role, { with: partner.userId })} size="sm" icon="chat">Chat</PillLink>
                </div>

                {role === "seller" ? (
                  <form action={updateConnectionAction} className="mt-4 grid gap-4 border-t border-app-line pt-4">
                    <input type="hidden" name="connectionId" value={connection.id} />
                    <input type="hidden" name="back" value={`${back}#my-partners`} />
                    <fieldset className="m-0 grid gap-2 border-0 p-0">
                      <legend className={field.label}>Offer customers</legend>
                      <div className="flex flex-wrap gap-4">
                        {OFFER_SERVICES.map((service) => {
                          const available = offered.includes(service);
                          return (
                            <label key={service} className={`flex items-center gap-2 text-[14px] ${available ? "" : "text-app-ink-faint"}`}>
                              <input type="checkbox" name="services" value={service} defaultChecked={connection.services.includes(service) && available} disabled={!available} className={field.checkbox} />
                              {serviceWord(service)}{available ? "" : " (not offered by this partner)"}
                            </label>
                          );
                        })}
                      </div>
                    </fieldset>

                    <fieldset className="m-0 grid gap-2 border-0 p-0">
                      <legend className={field.label}>At checkout, show</legend>
                      <label className="flex items-center gap-2 text-[14px]">
                        <input type="radio" name="showPartnerName" value="true" defaultChecked={connection.showPartnerName} className={field.checkbox} />
                        The partner&apos;s name ({partner.displayName})
                      </label>
                      <label className="flex flex-wrap items-center gap-2 text-[14px]">
                        <input type="radio" name="showPartnerName" value="false" defaultChecked={!connection.showPartnerName} className={field.checkbox} />
                        My own label:
                        <input name="label" defaultValue={connection.label ?? ""} maxLength={40} placeholder="Standard delivery" className={`${field.input} h-10 w-[220px]`} aria-label="Label customers see" />
                      </label>
                    </fieldset>

                    <fieldset className="m-0 grid gap-2 border-0 p-0">
                      <legend className={field.label}>Pay on delivery</legend>
                      <label className="flex items-center gap-2 text-[14px]">
                        <input type="checkbox" name="ownerPod" defaultChecked={connection.ownerPod} className={field.checkbox} />
                        Let customers pay this partner&apos;s rider in cash
                      </label>
                      {!connection.podAcceptedAt && (
                        <div className="grid gap-2 rounded-[14px] bg-app-canvas p-3.5">
                          <p className="m-0 text-[13.5px] leading-[1.5]">{POD_DISCLAIMER}</p>
                          <label className="flex items-center gap-2 text-[13.5px] font-bold">
                            <input type="checkbox" name="acceptPodDisclaimer" className={field.checkbox} />
                            I understand
                          </label>
                        </div>
                      )}
                      <p className="m-0 text-[12.5px] text-app-ink-soft">
                        Customers only see pay on delivery when you and the partner both switch it on.
                        {connection.ownerPod && !connection.partnerPod ? " Waiting for the partner to switch it on." : ""}
                      </p>
                    </fieldset>

                    <div className="flex flex-wrap gap-2">
                      <button type="submit" className={pillButton.ink}>Save</button>
                    </div>
                  </form>
                ) : null}

                <form action={endConnectionAction} className="mt-3 flex justify-end">
                  <input type="hidden" name="connectionId" value={connection.id} />
                  <input type="hidden" name="back" value={`${back}#my-partners`} />
                  <button type="submit" className={pillButton.danger}>Remove partner</button>
                </form>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}
