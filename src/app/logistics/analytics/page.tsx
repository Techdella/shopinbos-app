import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { Card, CardHead, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { BOOKING_STATUSES, PartnerPage, StatusPill, bookingNet, lagosDate, lagosDay, lagosStartOfToday, naira } from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Performance" };

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

export default async function LogisticsAnalyticsPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const startOfToday = lagosStartOfToday();
  const since = new Date(startOfToday.getTime() - 29 * DAY);
  const bookings = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partner.id, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" },
    take: 2000,
    select: {
      id: true, destination: true, deliveryFee: true, platformFee: true, netAmount: true, status: true,
      createdAt: true, deliveredAt: true, estimatedDelivery: true, seller: { select: { name: true } },
    },
  });

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
    <PartnerPage frame={{ user, partner }} title="Performance" sub={`How ${partner.displayName} did over the last 30 days.`}>
      <StatGrid className="mb-5">
        <StatTile tone="card" label="Jobs" value={bookings.length} hint={`${delivered.length} delivered`} />
        <StatTile tone="card" label="Earned" value={naira(earned)} hint="After Shopinbos fees" />
        <StatTile tone="card" label="Delivered" value={deliveryRate === null ? "—" : `${deliveryRate}%`} hint={deliveryRate === null ? "No finished jobs yet" : "Of finished jobs"} />
        <StatTile tone="card" label="On time" value={onTime === null ? "—" : `${onTime}%`} hint={onTime === null ? "Set expected delivery times on jobs" : `${timed.length} jobs with a promised time`} />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_400px]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="p-5">
            <CardHead title="Deliveries per day" sub={`${twoWeekTotal} in the last 14 days`} />
            {twoWeekTotal === 0 ? (
              <p className="m-0 mt-6 text-[14.5px] text-app-ink-soft">No deliveries in the last 14 days.</p>
            ) : (
              <>
                <ol aria-label="Deliveries per day, last 14 days" className="m-0 mt-5 flex h-[180px] list-none items-end gap-1.5 p-0 sm:gap-2.5">
                  {series.map((point) => (
                    <li key={point.day.toISOString()} className="group relative flex h-full min-w-0 flex-1 flex-col justify-end" title={`${lagosDate(point.day, { weekday: "short", day: "numeric", month: "short" })}: ${point.count} delivered`}>
                      <span className="sr-only">{lagosDate(point.day, { weekday: "short", day: "numeric", month: "short" })}: {point.count} delivered</span>
                      <span
                        aria-hidden
                        className="block w-full rounded-t-[4px] bg-app-ink transition group-hover:bg-app-accent"
                        style={{ height: point.count ? `${Math.max(4, (point.count / peak) * 100)}%` : "2px", opacity: point.count ? 1 : 0.15 }}
                      />
                    </li>
                  ))}
                </ol>
                <div aria-hidden className="mt-2 flex justify-between text-[12px] text-app-ink-soft">
                  <span>{lagosDate(days[0])}</span>
                  <span>Today</span>
                </div>
              </>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title="Jobs by stage" />
            {byStatus.length === 0 ? (
              <p className="m-0 mt-3 text-[14.5px] text-app-ink-soft">No jobs in the last 30 days.</p>
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
            <CardHead title="Rating" action={<TextLink href="/logistics/reviews">Reviews</TextLink>} />
            <div className="mt-3 flex items-baseline gap-2">
              <span className="text-[34px] font-extrabold leading-none">{partner.ratingCount ? partner.rating.toFixed(1) : "—"}</span>
              <span className="text-[14px] text-app-ink-soft">{partner.ratingCount ? `from ${partner.ratingCount} ${partner.ratingCount === 1 ? "review" : "reviews"}` : "No reviews yet"}</span>
            </div>
            {partner.reliabilityScore > 0 && <p className="m-0 mt-2 text-[14px] text-app-ink-soft">Reliability score {partner.reliabilityScore} out of 100</p>}
          </Card>

          <Card className="p-5">
            <CardHead title="Top sellers" sub="By delivery fees" />
            {topSellers.length === 0 ? (
              <p className="m-0 mt-3 text-[14.5px] text-app-ink-soft">No jobs yet.</p>
            ) : (
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {topSellers.map((seller) => (
                  <li key={seller.name} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14.5px] font-bold">{seller.name}</div>
                      <div className="text-[13px] text-app-ink-soft">{seller.count} {seller.count === 1 ? "job" : "jobs"}</div>
                    </div>
                    <span className="text-[14.5px] font-extrabold">{naira(seller.value)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <CardHead title="Busiest drop-off areas" />
            {topDestinations.length === 0 ? (
              <p className="m-0 mt-3 text-[14.5px] text-app-ink-soft">No jobs yet.</p>
            ) : (
              <ul className="m-0 mt-3 list-none divide-y divide-app-line p-0">
                {topDestinations.map((place) => (
                  <li key={place.name} className="flex items-center justify-between gap-3 py-2.5">
                    <span className="min-w-0 truncate text-[14.5px] font-bold">{place.name}</span>
                    <span className="shrink-0 text-[13.5px] text-app-ink-soft">{place.count} {place.count === 1 ? "job" : "jobs"}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </PartnerPage>
  );
}
