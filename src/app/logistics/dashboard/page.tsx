import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { VerificationChecklist } from "@/components/verification/VerificationChecklist";
import { LOGISTICS_DOC_TYPES } from "@shared/verification-docs";
import { respondToDeliveryQuote } from "@/app/actions/logistics";
import { Card, CardHead, ListCard, ListRow, Pill, PillLink, StageDot, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { AcceptAssignForm, riderPresence, riderSelect } from "@/components/logistics/dispatch";
import { DeclineJobForm, MarketJobFacts } from "@/components/logistics/market";
import { withOpenJobs } from "@/lib/logistics/dispatch-riders";
import { ensurePickupCoords } from "@/lib/logistics/geocode";
import { owedAfterCredit, payInDue } from "@/lib/logistics/payin-rules";
import { overdueCardWords, payInConfig } from "@/lib/logistics/payin-deadline";
import { payInOverdueView } from "@/lib/logistics/payin-standing.server";
import { PayInOverdueCard } from "@/components/logistics/PayInOverdueCard";
import { riderWhereWords } from "@shared/delivery-geo";
import { cashToPayIn, isRiderOut } from "@/lib/logistics/job-rules";
import { pickupWindowText } from "@shared/supplier-pickup";
import {
  ACTIVE_STATUSES,
  ActionNotice,
  PartnerPage,
  Route,
  SubmitButton,
  bookingNet,
  bookingStage,
  cashToCollect,
  inputClass,
  jobId,
  lagosDate,
  lagosStartOfToday,
  lagosTime,
  naira,
  packageSummary,
  timeAgo,
  type CodOrder,
  type LogisticsT,
} from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";
import { PartnerBrief } from "@/components/assistant/PartnerBrief";
import { partnerBriefFor } from "@/lib/dashboard/partner-brief.server";
import { PromoBanner } from "@/components/pricing/PromoBanner";

// Partner "Today", following the 2026 "Shopinbos Partners · web dispatch console" and mobile mockups.

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("today.metaTitle") };
}

function lagosGreeting(now: Date, t: LogisticsT) {
  const hour = (now.getUTCHours() + 1) % 24;
  return hour < 12 ? t("today.morning") : hour < 17 ? t("today.afternoon") : t("today.evening");
}

const RETURN = "/logistics/dashboard";

export default async function LogisticsDashboardPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;
  const t = await getT("logistics", "common");

  const now = new Date();
  const startOfToday = lagosStartOfToday(now);
  const bookingSelect = {
    id: true, orderId: true, pickupLocation: true, destination: true, deliveryFee: true, platformFee: true, netAmount: true,
    status: true, trackingCode: true, estimatedDelivery: true, createdAt: true, packageDetails: true, codAmount: true,
    pickupLat: true, pickupLng: true, pickupGeoSource: true, pickupGeocodedAt: true,
    pickupWindowStart: true, pickupWindowEnd: true,
    service: true, sizeBand: true, pickupPointId: true, shipmentKey: true, readyAt: true, acceptBy: true, feePaidAt: true,
    seller: { select: { name: true } }, rider: { select: { name: true } },
  } as const;

  const [newBookings, newQuotes, activeJobs, deliveredToday, pendingBookingCount, pendingQuoteCount, activeCount, ridersBase, unremittedCash] = await Promise.all([
    db.deliveryBooking.findMany({ where: { logisticsPartnerId: partner.id, status: "pending" }, orderBy: { createdAt: "asc" }, take: 6, select: bookingSelect }),
    db.deliveryQuoteRequest.findMany({
      where: { logisticsPartnerId: partner.id, status: "pending" },
      orderBy: { createdAt: "asc" },
      take: 6,
      select: { id: true, pickupLocation: true, destination: true, packageDetails: true, preferredDate: true, expiresAt: true, createdAt: true, seller: { select: { name: true } } },
    }),
    db.deliveryBooking.findMany({ where: { logisticsPartnerId: partner.id, status: { in: ACTIVE_STATUSES } }, orderBy: { createdAt: "desc" }, take: 8, select: bookingSelect }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, status: "delivered", deliveredAt: { gte: startOfToday } },
      select: { id: true, orderId: true, deliveryFee: true, platformFee: true, netAmount: true, codAmount: true, codCollected: true },
    }),
    db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: "pending" } }),
    db.deliveryQuoteRequest.count({ where: { logisticsPartnerId: partner.id, status: "pending" } }),
    db.deliveryBooking.count({ where: { logisticsPartnerId: partner.id, status: { in: ACTIVE_STATUSES } } }),
    db.logisticsTeamMember.findMany({ where: { logisticsPartnerId: partner.id, role: "rider" }, orderBy: { name: "asc" }, select: riderSelect }),
    db.deliveryBooking.findMany({
      where: { logisticsPartnerId: partner.id, codMethod: "cash", remittanceId: null, codCollected: { gt: 0 } },
      orderBy: [{ codCollectedAt: "asc" }, { createdAt: "asc" }],
      select: { codCollected: true, codMethod: true, remittanceId: true, codCollectedAt: true, createdAt: true },
    }),
  ]);
  // Closest rider first in "Accept and assign": riders' open jobs and the new jobs' pickup coordinates.
  const [riders, pickupGeo, overdue, brief] = await Promise.all([withOpenJobs(partner.id, ridersBase), ensurePickupCoords(newBookings, partner.country), payInOverdueView(partner.id, now), partnerBriefFor(partner, now)]);

  const pointIds = [...new Set(newBookings.map((job) => job.pickupPointId).filter((id): id is string => Boolean(id)))];
  const pointNames = new Map(
    (pointIds.length ? await db.logisticsPickupPoint.findMany({ where: { id: { in: pointIds }, logisticsPartnerId: partner.id }, select: { id: true, name: true } }) : []).map((point) => [point.id, point.name]),
  );
  const orderIds = [...newBookings, ...activeJobs, ...deliveredToday].map((booking) => booking.orderId).filter((id): id is string => Boolean(id));
  const orders: CodOrder[] = orderIds.length
    ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, total: true, status: true, paymentMethod: true } })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));
  const collectFor = (job: { orderId: string | null; codAmount: number | null }) =>
    job.codAmount ?? (job.orderId ? cashToCollect(orderById.get(job.orderId)) : 0);

  const earnedToday = deliveredToday.reduce((sum, booking) => sum + bookingNet(booking), 0);
  const cashCollectedToday = deliveredToday.reduce((sum, booking) => sum + (booking.codCollected ?? (booking.codAmount === null ? collectFor(booking) : 0)), 0);
  const cashOnActiveJobs = activeJobs.reduce((sum, booking) => sum + collectFor(booking), 0);
  const cashOwed = owedAfterCredit(cashToPayIn(unremittedCash), partner.payInCredit);
  const payIn = payInDue(unremittedCash[0] ? unremittedCash[0].codCollectedAt ?? unremittedCash[0].createdAt : null, now, payInConfig().cutoffHour);
  // No map library in the app: a list of riders out now with where each was last seen.
  const outNow = riders.filter((rider) => rider.status === "active" && isRiderOut(rider, now)).sort((a, b) => a.openJobs - b.openJobs || a.name.localeCompare(b.name));
  const presence = riderPresence(riders, now);
  const activeRiders = riders.filter((rider) => rider.status === "active");
  const newCount = pendingBookingCount + pendingQuoteCount;
  const taking = partner.status === "active";
  const areas = partner.coverageZones.length ? partner.coverageZones.join(", ") : partner.city;

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("today.greeting", { greeting: lagosGreeting(now, t), name: user.name.split(" ")[0] })}
      sub={`${lagosDate(now, { weekday: "long", day: "numeric", month: "long" }, now, t)} · ${areas}`}
      actions={<Pill tone={taking ? "success" : "muted"} dot>{taking ? t("today.taking") : t("today.notTaking")}</Pill>}
    >
      <PromoBanner role="logistics_partner" className="mb-5" />
      <ActionNotice saved={saved} error={error} savedText={t("today.saved")} />

      <div className="mb-5">
        <VerificationChecklist docs={partner.verificationDocuments} configs={LOGISTICS_DOC_TYPES} verificationStatus={partner.verificationStatus} href="/logistics/verification" />
      </div>

      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("today.newRequests")} value={newCount} />
        <StatTile tone="card" label={t("today.activeJobs")} value={activeCount} />
        <StatTile tone="card" label={t("today.deliveredToday")} value={deliveredToday.length} />
        <StatTile tone="card" label={t("today.earnedToday")} value={naira(earnedToday)} />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_minmax(360px,440px)]">
        <div className="grid min-w-0 content-start gap-5">
          {/* Peggy's brief (what needs doing now) and Rex's ideas (ways to grow): shared/partner-brief.ts */}
          <PartnerBrief role="partner" peggy={brief.peggy} rex={brief.rex} />
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="truck" size={22} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[17px] font-extrabold">
                {riders.length === 0 ? t("today.noRiders") : t("today.ridersOut", { out: presence.out, offline: presence.offline })}
              </h2>
              <p className="m-0 mt-0.5 text-[15px] text-app-ink-soft">
                {riders.length === 0 ? t("today.addRidersHint") : t("today.ridersOnlineHint")}
              </p>
            </div>
            <PillLink href="/logistics/couriers" size="sm">{riders.length === 0 ? t("today.addRider") : t("today.seeRiders")}</PillLink>
            {outNow.length > 0 && (
              <ul className="m-0 grid w-full list-none gap-0 p-0" aria-label={t("today.ridersOutNow")}>
                {outNow.slice(0, 8).map((rider) => (
                  <li key={rider.id} className="flex min-w-0 items-center gap-3 border-t border-app-line py-2.5 first:border-t-0">
                    <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${rider.openJobs ? "bg-app-accent" : "bg-app-success"}`} />
                    <span className="min-w-0 flex-1 truncate text-[15px]">
                      <b className="font-extrabold">{rider.name}</b> · {rider.openJobs ? t("today.onAJob") : t("dispatch.free")}
                      <span className="text-app-ink-soft"> · {riderWhereWords({ lat: rider.lastLat, lng: rider.lastLng, locationAt: rider.lastLocationAt, lastSeenAt: rider.lastSeenAt }, now)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <section aria-labelledby="active-jobs" className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="active-jobs" className="m-0 text-[18px] font-extrabold">{t("today.activeJobs")}</h2>
              <TextLink href="/logistics/bookings">{t("today.allJobs")}</TextLink>
            </div>
            {activeJobs.length === 0 ? (
              <Card className="px-5 py-8 text-center text-[15px] text-app-ink-soft">{t("today.noActive")}</Card>
            ) : (
              <ListCard>
                {activeJobs.map((job) => {
                  const stage = bookingStage(job.status, t);
                  return (
                    <ListRow key={job.id} href="/logistics/bookings">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-app-ink-soft"><Icon name="box" size={18} /></span>
                      <div className="min-w-0 flex-1 basis-[180px]">
                        <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" toLabel={t("kit.to")} />
                        {job.pickupWindowStart && <div className="truncate text-[14.5px] font-extrabold text-app-accent-ink">{pickupWindowText(job.pickupWindowStart, job.pickupWindowEnd, now)}</div>}
                        <div className="truncate text-[15px] text-app-ink-soft">{jobId(job.id)} · {job.seller.name}</div>
                      </div>
                      <div className="min-w-0 basis-full sm:basis-[200px]"><StageDot tone={stage.tone}>{stage.label}</StageDot></div>
                      <div className={`min-w-0 truncate text-[15px] sm:w-[140px] ${job.rider ? "text-app-ink-soft" : "font-bold text-app-accent-ink"}`}>
                        {job.rider?.name ?? t("today.noRiderYet")}
                      </div>
                      <div className="ml-auto text-[15px] font-extrabold">{naira(job.deliveryFee)}</div>
                    </ListRow>
                  );
                })}
              </ListCard>
            )}
          </section>
        </div>

        <div className="order-first grid min-w-0 content-start gap-4 xl:order-none">
          {overdue && <PayInOverdueCard {...overdueCardWords({ amount: overdue.amount, since: new Date(overdue.since), paused: overdue.paused, now }, t)} account={overdue.account} />}
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[18px] font-extrabold">{t("today.newRequests")}</h2>
            {newCount > 0 && <TextLink href={pendingBookingCount ? "/logistics/bookings" : "/logistics/quotes"}>{t("seeAll")}</TextLink>}
          </div>

          {newBookings.length + newQuotes.length === 0 && (
            <Card className="px-5 py-8 text-center text-[15px] text-app-ink-soft">
              {t("today.noNew")}
            </Card>
          )}

          {newBookings.map((job) => {
            const collect = collectFor(job);
            return (
              <Card key={job.id} as="article" className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <Pill tone="accent">{t("today.booked", { when: timeAgo(job.createdAt, now, t) })}</Pill>
                  <span className="text-[20px] font-extrabold">{naira(job.deliveryFee)}</span>
                </div>
                <div className="mt-3 min-w-0">
                  <Route from={job.pickupLocation} to={job.destination} className="block break-words text-[15px]" toLabel={t("kit.to")} />
                  {job.pickupWindowStart && <p className="m-0 mt-0.5 text-[15px] font-extrabold text-app-accent-ink">{pickupWindowText(job.pickupWindowStart, job.pickupWindowEnd, now)}</p>}
                  <p className="m-0 mt-0.5 text-[15px] text-app-ink-soft">
                    {packageSummary(job.packageDetails, t)} · {job.seller.name}
                    {job.estimatedDelivery ? ` · ${t("today.deliverBy", { time: lagosTime(job.estimatedDelivery, t), date: lagosDate(job.estimatedDelivery, undefined, now, t) })}` : ""}
                  </p>
                </div>
                {collect > 0 && <div className="mt-3"><Pill tone="warning">{t("today.collect", { amount: naira(collect) })}</Pill></div>}
                <div className="mt-3 empty:hidden"><MarketJobFacts job={job} pointName={job.pickupPointId ? pointNames.get(job.pickupPointId) : null} now={now} t={t} /></div>
                <div className="mt-4 flex flex-wrap items-start gap-2">
                  <DeclineJobForm bookingId={job.id} returnTo={RETURN} />
                  <AcceptAssignForm bookingId={job.id} riders={activeRiders} returnTo={RETURN} className="flex-1" pickup={pickupGeo.get(job.id)} />
                </div>
              </Card>
            );
          })}

          {newQuotes.map((quote) => (
            <Card key={quote.id} as="article" className="p-5">
              <div className="flex items-center justify-between gap-3">
                <Pill tone="accent">{quote.expiresAt ? t("today.replyBy", { when: lagosTime(quote.expiresAt, t) }) : t("today.asked", { when: timeAgo(quote.createdAt, now, t) })}</Pill>
                <span className="text-[15px] font-bold text-app-ink-soft">{t("today.quoteRequest")}</span>
              </div>
              <div className="mt-3 min-w-0">
                <Route from={quote.pickupLocation} to={quote.destination} className="block break-words text-[15px]" toLabel={t("kit.to")} />
                <p className="m-0 mt-0.5 text-[15px] text-app-ink-soft">
                  {packageSummary(quote.packageDetails, t)} · {quote.seller.name}
                  {quote.preferredDate ? ` · ${t("today.wanted", { date: lagosDate(quote.preferredDate, undefined, now, t) })}` : ""}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <form action={respondToDeliveryQuote}>
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="intent" value="reject" />
                  <input type="hidden" name="returnTo" value={RETURN} />
                  <SubmitButton tone="white" size="sm">{t("today.decline")}</SubmitButton>
                </form>
                <form action={respondToDeliveryQuote} className="flex min-w-0 flex-1 gap-2">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="intent" value="respond" />
                  <input type="hidden" name="returnTo" value={RETURN} />
                  <label className="sr-only" htmlFor={`price-${quote.id}`}>{t("today.priceInNaira")}</label>
                  <input
                    id={`price-${quote.id}`}
                    name="quotedPrice"
                    type="number"
                    min="1"
                    step="1"
                    required
                    inputMode="numeric"
                    defaultValue={partner.basePrice > 0 ? String(partner.basePrice) : ""}
                    placeholder={t("today.pricePlaceholder")}
                    className={`${inputClass} h-10 min-w-[90px] flex-1 rounded-full`}
                  />
                  <SubmitButton size="sm" tone="white">{t("today.sendPrice")}</SubmitButton>
                </form>
              </div>
            </Card>
          ))}

          {!overdue && (cashOwed > 0 || cashCollectedToday > 0 || cashOnActiveJobs > 0) && (
            <Card className="border-0 bg-[#FDF0D5] p-5">
              <CardHead
                title={cashOwed > 0 ? (payIn.late ? t("today.payInNow") : t("today.payInWhen", { when: payIn.words })) : t("today.cashToCollect")}
                action={<span className="text-[18px] font-extrabold">{naira(cashOwed > 0 ? cashOwed : cashOnActiveJobs)}</span>}
              />
              <p className="m-0 mt-1 text-[15px] leading-[1.5] text-[#5C4100]">
                {cashOwed > 0
                  ? t("today.codOwed")
                  : t("today.codActive")}
                {cashCollectedToday > 0 ? ` ${t("today.collectedToday", { amount: naira(cashCollectedToday) })}` : ""}
                {cashOwed > 0 && cashOnActiveJobs > 0 ? ` ${t("today.moreToCollect", { amount: naira(cashOnActiveJobs) })}` : ""}
              </p>
              <PillLink href="/logistics/cash" size="sm" className="mt-3">{t("today.openCod")}</PillLink>
            </Card>
          )}
        </div>
      </div>
    </PartnerPage>
  );
}
