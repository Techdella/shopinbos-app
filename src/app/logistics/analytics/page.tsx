import type { Metadata } from "next";
import { logisticsLimits } from "@shared/plans";
import { planOfUser } from "@/lib/plan-limits";
import { AnalyticsPlanNote } from "@/components/plans/AnalyticsPlanNote";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, CardHead, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { BOOKING_STATUSES, PartnerPage, StatusPill, bookingNet, lagosDate, lagosDay, lagosStartOfToday, naira } from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";
import { partnerMarketAnalytics } from "@/lib/delivery-market/analytics.server";
import { readRangeDays } from "@/lib/delivery-market/analytics";
import { durationLabel, rangeLabel } from "@/components/delivery-market/words";
import { BreakdownCard, CountCard, IssuesCard, RangeChips, WeeklyChart, rateText } from "@/components/delivery-market/DeliveryAnalytics";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("performance.title") };
}

const DAY = 24 * 60 * 60 * 1000;

function topBy<T>(rows: T[], key: (row: T) => string, value: (row: T) => number, limit = 5) {
  const totals = new Map<string, { count: number; value: number }>();
  for (const row of rows) {
    const entry = totals.get(key(row)) ?? { count: 0, value: 0 };
    entry.count += 1;
    entry.value += value(row);
    totals.set(key(row), entry);
  }
  return [...totals.entries()].map(([name, entry]) => ({ name, ...entry })).sort((a, b) => b.value - a.value || b.count - a.count).slice(0, limit);
}

export default async function LogisticsAnalyticsPage({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const rangeDays = readRangeDays((await searchParams).range);
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const t = await getT("logistics", "delivery", "common");
  const analytics = logisticsLimits(await planOfUser(user.id)).analytics;
  const now = new Date();
  const dayWords = (day: Date) => lagosDate(day, { weekday: "short", day: "numeric", month: "short" }, now, t);

  const startOfToday = lagosStartOfToday();
  const since = new Date(startOfToday.getTime() - 29 * DAY);
  const [bookings, market] = await Promise.all([db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partner.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true, destination: true, deliveryFee: true, platformFee: true, netAmount: true, status: true,
      createdAt: true, deliveredAt: true, estimatedDelivery: true, seller: { select: { name: true } },
    },
  }), partnerMarketAnalytics(partner.id, rangeDays, now)]);
  const mt = market.totals;

  const delivered = bookings.filter((booking) => booking.status === "delivered");
  const finished = bookings.filter((booking) => ["delivered", "failed", "cancelled"].includes(booking.status));
  const deliveryRate = finished.length ? Math.round((delivered.length / finished.length) * 100) : null;
  const timed = delivered.filter((booking) => booking.deliveredAt && booking.estimatedDelivery);
  const onTime = timed.length ? Math.round((timed.filter((booking) => booking.deliveredAt! <= booking.estimatedDelivery!).length / timed.length) * 100) : null;
  const earned = delivered.reduce((sum, booking) => sum + bookingNet(booking), 0);

  // Deliveries per day over the last 14 days (Lagos days).
  const days = Array.from({ length: 14 }, (_, index) => new Date(startOfToday.getTime() - (13 - index) * DAY));
  const perDay = new Map(days.map((day) => [lagosDay(day), 0]));
  for (const booking of delivered) {
    const key = lagosDay(booking.deliveredAt ?? booking.createdAt);
    if (perDay.has(key)) perDay.set(key, (perDay.get(key) ?? 0) + 1);
  }
  const series = days.map((day) => ({ day, count: perDay.get(lagosDay(day)) ?? 0 }));
  const peak = Math.max(1, ...series.map((point) => point.count));
  const twoWeekTotal = series.reduce((sum, point) => sum + point.count, 0);

  const byStatus = BOOKING_STATUSES.map((status) => ({ status, count: bookings.filter((booking) => booking.status === status).length })).filter((row) => row.count > 0);
  const topSellers = topBy(bookings, (booking) => booking.seller.name, (booking) => booking.deliveryFee);
  const topDestinations = topBy(bookings, (booking) => booking.destination, () => 1);

  return (
    <PartnerPage frame={{ user, partner }} title={t("performance.title")} sub={t("performance.sub")}>
      <StatGrid className="mb-5">
        <StatTile tone="card" label={t("jobs.title")} value={bookings.length} hint={t("earnings.delivered", { count: delivered.length })} />
        <StatTile tone="card" label={t("performance.earned")} value={naira(earned)} hint={t("performance.afterFees")} />
        <StatTile tone="card" label={t("stage.delivered")} value={deliveryRate === null ? "—" : `${deliveryRate}%`} hint={deliveryRate === null ? t("performance.noFinished") : t("performance.ofFinished")} />
        <StatTile tone="card" label={t("performance.onTime")} value={onTime === null ? "—" : `${onTime}%`} hint={onTime === null ? t("performance.onTimeHint") : t("performance.promised", { count: timed.length })} />
      </StatGrid>

      <AnalyticsPlanNote level={analytics} billingHref="/logistics/billing" exportHref="/api/logistics/analytics/export" />

      {analytics === "basic" ? null : (
      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title={t("performance.perDay")} sub={t("performance.last14", { count: twoWeekTotal })} />
            {twoWeekTotal === 0 ? (
              <p className="m-0 mt-6 text-[15px] text-app-ink-soft">{t("performance.none14")}</p>
            ) : (
              <>
                <ol aria-label={t("performance.chartAria")} className="m-0 mt-5 flex h-[180px] list-none items-end gap-1.5 p-0 sm:gap-2.5">
                  {series.map((point) => (
                    <li key={point.day.toISOString()} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={t("performance.dayCount", { day: dayWords(point.day), count: point.count })}>
                      <span className="sr-only">{t("performance.dayCount", { day: dayWords(point.day), count: point.count })}</span>
                      <span
                        aria-hidden
                        className="block w-full rounded-t-[4px] bg-app-ink transition group-hover:bg-app-accent"
                        style={{ height: point.count ? `${Math.max(4, (point.count / peak) * 100)}%` : "2px", opacity: point.count ? 1 : 0.15 }}
                      />
                    </li>
                  ))}
                </ol>
                <div aria-hidden className="mt-2 flex justify-between text-[12px] text-app-ink-soft">
                  <span>{lagosDate(days[0], undefined, now, t)}</span>
                  <span>{t("time.today")}</span>
                </div>
              </>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title={t("performance.byStage")} />
            {byStatus.length === 0 ? (
              <p className="m-0 mt-3 text-[15px] text-app-ink-soft">{t("performance.none30")}</p>
            ) : (
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {byStatus.map((row) => (
                  <li key={row.status} className="flex items-center justify-between gap-3 py-2.5">
                    <StatusPill status={row.status} />
                    <span className="text-[15px] font-extrabold">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title={t("performance.rating")} action={<TextLink href="/logistics/reviews">{t("reviews.title")}</TextLink>} />
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-[34px] font-extrabold leading-none">{partner.ratingCount ? partner.rating.toFixed(1) : "—"}</span>
              <span className="text-[15px] text-app-ink-soft">{partner.ratingCount ? t("performance.fromReviews", { count: partner.ratingCount }) : t("reviews.emptyTitle")}</span>
            </div>
            {partner.reliabilityScore > 0 && <p className="m-0 mt-2 text-[15px] text-app-ink-soft">{t("performance.reliability", { score: partner.reliabilityScore })}</p>}
          </Card>

          <Card className="p-5">
            <CardHead title={t("performance.topSellers")} sub={t("performance.byFees")} />
            {topSellers.length === 0 ? (
              <p className="m-0 mt-3 text-[15px] text-app-ink-soft">{t("performance.noJobs")}</p>
            ) : (
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {topSellers.map((seller) => (
                  <li key={seller.name} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[15px] font-bold">{seller.name}</div>
                      <div className="text-[15px] text-app-ink-soft">{t("cash.jobs", { count: seller.count })}</div>
                    </div>
                    <span className="text-[15px] font-extrabold">{naira(seller.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title={t("performance.busiest")} />
            {topDestinations.length === 0 ? (
              <p className="m-0 mt-3 text-[15px] text-app-ink-soft">{t("performance.noJobs")}</p>
            ) : (
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {topDestinations.map((place) => (
                  <li key={place.name} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-[15px] font-bold">{place.name}</span>
                    <span className="shrink-0 text-[15px] text-app-ink-soft">{t("cash.jobs", { count: place.count })}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      )}

      {/* Logistics marketplace jobs: offered through shops' connections, accepted or declined, and how they went. */}
      {analytics === "basic" ? null : (
      <section id="marketplace" aria-labelledby="marketplace-title" className="mt-10 grid scroll-mt-4 gap-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="marketplace-title" className="m-0 text-[22px] font-extrabold tracking-[-0.4px]">{t("market.an.title")}</h2>
            <p className="mb-0 mt-1 text-[14px] text-app-ink-soft">{t("market.an.sub", { range: rangeLabel(t, rangeDays).toLowerCase() })}</p>
          </div>
          <RangeChips path="/logistics/analytics" days={rangeDays} hash="marketplace" />
        </div>

        {mt.offered === 0 ? (
          <Card className="p-5">
            <p className="m-0 text-[15px] text-app-ink-soft">{t("market.an.empty")}</p>
          </Card>
        ) : (
          <>
            <StatGrid>
              <StatTile tone="card" label={t("market.an.offered")} value={mt.offered} hint={t("market.an.offeredHint", { accepted: mt.accepted, declined: mt.declined, late: mt.notAcceptedInTime })} />
              <StatTile tone="card" label={t("an.acceptance")} value={rateText(mt.acceptanceRate)} hint={t("market.an.acceptedIn", { time: durationLabel(t, mt.medianAcceptMs) })} />
              <StatTile tone="card" label={t("market.an.delivered")} value={mt.delivered} hint={t("market.an.pickupToDelivery", { time: durationLabel(t, mt.medianPickupToDeliveryMs) })} />
              <StatTile tone="card" label={t("market.an.earned")} value={naira(mt.fees)} hint={t("an.paidInApp", { paid: naira(mt.feesPaidInApp), notPaid: naira(mt.feesNotInApp) })} />
              <StatTile tone="card" label={t("onTime")} value={rateText(mt.onTimeRate)} hint={mt.timed ? t("an.fromTimed", { count: mt.timed }) : t("an.noPromised")} />
              <StatTile tone="card" label={t("failedDeliveries")} value={rateText(mt.failedRate)} hint={t("an.failedHint", { attempts: mt.failedAttempts, returned: mt.returned })} />
              <StatTile tone="card" label={t("market.an.cancelled")} value={mt.cancelled} hint={t("market.an.cancelledHint")} />
              <StatTile tone="card" label={t("an.customerProblems")} value={market.issueCount} hint={market.openIssues ? t("an.stillOpen", { count: market.openIssues }) : t("an.noneOpen")} />
            </StatGrid>

            <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
              <div className="grid min-w-0 content-start gap-5">
                <WeeklyChart weeks={market.weeks} title={t("an.perWeek")} feesLabel={t("market.an.earnings")} />
                <BreakdownCard title={t("market.an.whereYouDeliver")} sub={t("market.an.customersStates")} rows={market.states} kind="state" />
              </div>
              <div className="grid min-w-0 content-start gap-5">
                <BreakdownCard title={t("services")} rows={market.services} kind="service" />
                <BreakdownCard title={t("an.parcelSizes")} rows={market.sizes} kind="size" />
                <CountCard title={t("market.an.whyDeclined")} rows={market.declineReasons} empty={t("market.an.noDeclines")} />
                <IssuesCard rows={market.issues} sub={t("market.an.issuesSub")} />
              </div>
            </div>
          </>
        )}
      </section>
      )}
    </PartnerPage>
  );
}
