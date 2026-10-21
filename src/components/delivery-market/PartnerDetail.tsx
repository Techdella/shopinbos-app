import { Card, CardHead, Pill, PillLink, SplitLayout, StatGrid, StatTile, Thumb } from "@/components/app-kit";
import { pillButton } from "@/components/seller-core";
import { messagesHref } from "@/lib/conversations/pure";
import type { partnerDetail } from "@/lib/delivery-market/manage.server";
import { connectPartnerAction, endConnectionAction, respondRateCardAction } from "@/app/actions/delivery-market";
import { CardExtras, RateTable, Rating, VerifiedPill, areasSummary } from "./bits";
import { serviceLabel } from "./words";
import { getT } from "@/lib/i18n/server";
import { Term } from "@/components/learn/Term";

// A delivery partner's page for sellers and suppliers (spec §5.3): rates, coverage, pickup points, reviews and
// in-app stats, with Chat and Connect / Remove.

type Detail = NonNullable<Awaited<ReturnType<typeof partnerDetail>>>;

export async function PartnerDetail({ detail, role, back }: { detail: Detail; role: "seller" | "supplier"; back: string }) {
  const t = await getT("delivery");
  const NOT_ENOUGH = t("detail.notEnough");
  const { partner, card, privateCard, stats, connection } = detail;
  const date = (value: Date) => value.toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" });

  const actions = (
    <div className="flex flex-wrap gap-2">
      <PillLink href={messagesHref(role, { with: partner.userId })} size="sm" icon="chat">{t("chat")}</PillLink>
      {connection ? (
        <form action={endConnectionAction}>
          <input type="hidden" name="connectionId" value={connection.id} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={pillButton.danger}>{t("removePartner")}</button>
        </form>
      ) : (
        <form action={connectPartnerAction}>
          <input type="hidden" name="partnerId" value={partner.id} />
          <input type="hidden" name="back" value={back} />
          <button type="submit" className={pillButton.ink}>{t("connect")}</button>
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
            {partner.cacNumber && <Pill tone="info">{t("detail.cacRegistered")}</Pill>}
            {connection && <Pill tone="success">{t("connected")}</Pill>}
            <Rating rating={partner.rating} count={partner.ratingCount} />
          </div>
        </div>
        {actions}
      </Card>

      <StatGrid>
        <StatTile tone="card" label={t("detail.deliveriesOnShopinbos")} value={stats.completed.toLocaleString("en-NG")} />
        <StatTile tone="card" label={t("onTime")} value={stats.onTimeRate === null ? "–" : `${stats.onTimeRate}%`} hint={stats.onTimeRate === null ? NOT_ENOUGH : undefined} />
        <StatTile tone="card" label={t("failedDeliveries")} value={stats.failedRate === null ? "–" : `${stats.failedRate}%`} hint={stats.failedRate === null ? NOT_ENOUGH : undefined} />
        <StatTile tone="card" label={t("pickupPoints")} value={partner.pickupPoints.length} />
      </StatGrid>

      <SplitLayout
        main={
          <>
            {privateCard && (
              <Card className="p-5">
                <CardHead
                  title={t("detail.privateTitle")}
                  sub={privateCard.status === "accepted" ? t("detail.privateAccepted") : t("detail.privateProposed")}
                  action={<Pill tone={privateCard.status === "accepted" ? "success" : "warning"}>{privateCard.status === "accepted" ? t("detail.inUse") : t("mine.waitingForYou")}</Pill>}
                />
                <div className="mt-4"><RateTable rows={privateCard.rows} /></div>
                <CardExtras card={privateCard} />
                {privateCard.status === "proposed" && (
                  <form action={respondRateCardAction} className="mt-4 flex flex-wrap gap-2">
                    <input type="hidden" name="cardId" value={privateCard.id} />
                    <input type="hidden" name="back" value={back} />
                    <button type="submit" name="decision" value="accept" className={pillButton.ink}>{t("mine.acceptRates")}</button>
                    <button type="submit" name="decision" value="decline" className={pillButton.white}>{t("mine.decline")}</button>
                  </form>
                )}
              </Card>
            )}

            <Card className="p-5">
              <CardHead title={t("mine.publicRates")} sub={card ? t("detail.updated", { date: date(card.updatedAt) }) : undefined} />
              <div className="mt-4">{card ? <RateTable rows={card.rows} /> : <p className="m-0 text-[14px] text-app-ink-soft">{t("detail.noPublicRates")}</p>}</div>
              {card && <CardExtras card={card} />}
            </Card>

            <Card className="p-5">
              <CardHead title={t("detail.reviews")} sub={partner.ratingCount ? <Rating rating={partner.rating} count={partner.ratingCount} /> : undefined} />
              {partner.reviews.length === 0 ? (
                <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("detail.noReviews")}</p>
              ) : (
                <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                  {partner.reviews.map((review) => (
                    <li key={review.id} className="grid gap-1 py-3 text-[14px]">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-bold">{"★".repeat(Math.max(0, Math.min(5, review.rating)))}<span className="text-app-ink-faint">{"★".repeat(5 - Math.max(0, Math.min(5, review.rating)))}</span></span>
                        <span className="text-[12.5px] text-app-ink-soft">{review.reviewer.name} · {date(review.createdAt)}</span>
                      </div>
                      {review.comment && <p className="m-0 whitespace-pre-line">{review.comment}</p>}
                      {review.response && <p className="m-0 whitespace-pre-line text-app-ink-soft"><span className="font-bold">{t("detail.reply")} </span>{review.response}</p>}
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
                <CardHead title={t("detail.about")} />
                <p className="mb-0 mt-2 whitespace-pre-line text-[14px] leading-[1.55]">{partner.description}</p>
              </Card>
            )}
            <Card className="p-5">
              <CardHead title={t("detail.coverage")} />
              <dl className="m-0 mt-3 grid gap-3 text-[14px]">
                <div>
                  <dt className="text-[12.5px] text-app-ink-soft">{t("services")}</dt>
                  <dd className="m-0 mt-1 flex flex-wrap gap-1.5">
                    {partner.services.map((service) => <Pill key={service} tone="muted">{serviceLabel(t, service)}</Pill>)}
                    {partner.offersPayOnDelivery && <Pill tone="muted">{t("pod.title")}</Pill>}
                  </dd>
                </div>
                <div>
                  <dt className="text-[12.5px] text-app-ink-soft">{t("detail.collectsFrom")}</dt>
                  <dd className="m-0">{areasSummary(partner.pickupAreas, 30, t)}</dd>
                </div>
                <div>
                  <dt className="text-[12.5px] text-app-ink-soft">{t("find.deliversTo")}</dt>
                  <dd className="m-0">{areasSummary(partner.deliveryAreas, 30, t)}</dd>
                </div>
              </dl>
            </Card>
            <Card className="p-5">
              <CardHead title={<Term k="pickup-points">{t("pickupPoints")}</Term>} sub={partner.pickupPoints.length ? t("detail.pointsSub") : undefined} />
              {partner.pickupPoints.length === 0 ? (
                <p className="mb-0 mt-3 text-[14px] text-app-ink-soft">{t("detail.noPoints")}</p>
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
