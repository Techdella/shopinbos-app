import { Card, CardHead, Pill, PillLink, SplitLayout, StatGrid, StatTile, Thumb } from "@/components/app-kit";
import { pillButton } from "@/components/seller-core";
import { messagesHref } from "@/lib/conversations/pure";
import type { partnerDetail } from "@/lib/delivery-market/manage.server";
import { connectPartnerAction, endConnectionAction, respondRateCardAction } from "@/app/actions/delivery-market";
import { CardExtras, RateTable, Rating, VerifiedPill, areasSummary, serviceWord } from "./bits";

// A delivery partner's page for sellers and suppliers (spec §5.3): rates, coverage, pickup points, reviews and
// in-app stats, with Chat and Connect / Remove.

type Detail = NonNullable<Awaited<ReturnType<typeof partnerDetail>>>;

const NOT_ENOUGH = "Not enough deliveries yet";

export function PartnerDetail({ detail, role, back }: { detail: Detail; role: "seller" | "supplier"; back: string }) {
  const { partner, card, privateCard, stats, connection } = detail;
  const date = (value: Date) => value.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

  const actions = (
    <div className="flex flex-wrap gap-2">
      <PillLink href={messagesHref(role, { with: partner.userId })} size="sm" icon="chat">Chat</PillLink>
      {connection ? (
        <form action={endConnectionAction}>
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={pillButton.danger}>Remove partner</button>
        </form>
      ) : (
        <form action={connectPartnerAction}>
          <input type="hidden" name="partnerId" value={partner.id} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={pillButton.ink}>Connect</button>
        </form>
      )}
    </div>
  );

  return (
    <div className="grid gap-5">
      <Card className="flex flex-wrap items-center gap-4 p-5">
        <Thumb src={partner.logoUrl} label={partner.displayName} size={56} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 text-[20px] font-extrabold">{partner.displayName}</h2>
          {partner.companyName && partner.companyName !== partner.displayName && <div className="text-[13.5px] text-app-ink-soft">{partner.companyName}</div>}
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[13.5px]">
            <VerifiedPill status={partner.verificationStatus} />
            {partner.cacNumber && <Pill tone="info">CAC registered</Pill>}
            {connection && <Pill tone="success">Connected</Pill>}
            <Rating rating={partner.rating} count={partner.ratingCount} />
          </div>
        </div>
        {actions}
      </Card>

      <StatGrid>
        <StatTile tone="card" label="Deliveries on Shopinbos" value={stats.completed.toLocaleString("en-NG")} />
        <StatTile tone="card" label="On time" value={stats.onTimeRate === null ? "–" : `${stats.onTimeRate}%`} hint={stats.onTimeRate === null ? NOT_ENOUGH : undefined} />
        <StatTile tone="card" label="Failed deliveries" value={stats.failedRate === null ? "–" : `${stats.failedRate}%`} hint={stats.failedRate === null ? NOT_ENOUGH : undefined} />
        <StatTile tone="card" label="Pickup points" value={partner.pickupPoints.length} />
      </StatGrid>

      <SplitLayout
        main={
          <>
            {privateCard && (
              <Card className="p-5">
                <CardHead
                  title="Your private rates"
                  sub={privateCard.status === "accepted" ? "You accepted these. They price your deliveries with this partner." : "This partner sent you their own prices."}
                  action={<Pill tone={privateCard.status === "accepted" ? "success" : "warning"}>{privateCard.status === "accepted" ? "In use" : "Waiting for you"}</Pill>}
                />
                <div className="mt-4"><RateTable rows={privateCard.rows} /></div>
                <CardExtras card={privateCard} />
                {privateCard.status === "proposed" && (
                  <form action={respondRateCardAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="cardId" value={privateCard.id} />
                    <input type="hidden" name="back" value={back} />
                    <button type="submit" name="decision" value="accept" className={pillButton.ink}>Accept these rates</button>
                    <button type="submit" name="decision" value="decline" className={pillButton.white}>Decline</button>
                  </form>
                )}
              </Card>
            )}

            <Card className="p-5">
              <CardHead title="Public rates" sub={card ? `Updated ${date(card.updatedAt)}` : undefined} />
              <div className="mt-4">{card ? <RateTable rows={card.rows} /> : <p className="m-0 text-[14px] text-app-ink-soft">This partner hasn&apos;t published rates yet.</p>}</div>
              {card && <CardExtras card={card} />}
            </Card>

            <Card className="p-5">
              <CardHead title="Reviews" sub={partner.ratingCount ? <Rating rating={partner.rating} count={partner.ratingCount} /> : undefined} />
              {partner.reviews.length === 0 ? (
                <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">No reviews yet.</p>
              ) : (
                <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                  {partner.reviews.map((review) => (
                    <li key={review.id} className="grid gap-1 py-3 text-[14px]">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-bold">{"★".repeat(Math.max(0, Math.min(5, review.rating)))}<span className="text-app-ink-faint">{"★".repeat(5 - Math.max(0, Math.min(5, review.rating)))}</span></span>
                        <span className="text-[12.5px] text-app-ink-soft">{review.reviewer.name} · {date(review.createdAt)}</span>
                      </div>
                      {review.comment && <p className="m-0 whitespace-pre-line">{review.comment}</p>}
                      {review.response && <p className="m-0 whitespace-pre-line text-app-ink-soft"><span className="font-bold">Reply: </span>{review.response}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        }
        side={
          <>
            {partner.description && (
              <Card className="p-5">
                <CardHead title="About" />
                <p className="mb-0 mt-2 whitespace-pre-line text-[14px] leading-[1.55]">{partner.description}</p>
              </Card>
            )}
            <Card className="p-5">
              <CardHead title="Coverage" />
              <dl className="m-0 mt-3 grid gap-3 text-[14px]">
                <div>
                  <dt className="text-[12.5px] text-app-ink-soft">Services</dt>
                  <dd className="m-0 mt-1 flex flex-wrap gap-1.5">
                    {partner.services.map((service) => <Pill key={service} tone="muted">{serviceWord(service)}</Pill>)}
                    {partner.offersPayOnDelivery && <Pill tone="muted">Pay on delivery</Pill>}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12.5px] text-app-ink-soft">Collects from</dt>
                  <dd className="m-0">{areasSummary(partner.pickupAreas, 30)}</dd>
                </div>
                <div>
                  <dt className="text-[12.5px] text-app-ink-soft">Delivers to</dt>
                  <dd className="m-0">{areasSummary(partner.deliveryAreas, 30)}</dd>
                </div>
              </dl>
            </Card>
            <Card className="p-5">
              <CardHead title="Pickup points" sub={partner.pickupPoints.length ? "Customers can collect parcels here." : undefined} />
              {partner.pickupPoints.length === 0 ? (
                <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">No pickup points.</p>
              ) : (
                <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                  {partner.pickupPoints.map((point) => (
                    <li key={point.id} className="grid gap-0.5 py-2.5 text-[13.5px]">
                      <span className="font-bold">{point.name}</span>
                      <span>{point.address}{point.area ? `, ${point.area}` : ""}, {point.state}</span>
                      {(point.hours || point.phone) && <span className="text-app-ink-soft">{[point.hours, point.phone].filter(Boolean).join(" · ")}</span>}
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </>
        }
      />
    </div>
  );
}
