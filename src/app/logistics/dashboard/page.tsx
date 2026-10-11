import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { respondToDeliveryQuote, updateDeliveryBookingStatus } from "@/app/actions/logistics";
import { Card, CardHead, ListCard, ListRow, Pill, PillLink, StageDot, StatGrid, StatTile, TextLink } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import { AcceptAssignForm, riderPresence, riderSelect } from "@/components/logistics/dispatch";
import { cashToPayIn } from "@/lib/logistics/job-rules";
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
} from "@/components/logistics/kit";

// Partner "Today", following the 2026 "Shopinbos Partners · web dispatch console" and mobile mockups.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Today" };

function lagosGreeting(now: Date) {
  const hour = (now.getUTCHours() + 1) % 24;
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

const RETURN = "/logistics/dashboard";

export default async function LogisticsDashboardPage({ searchParams }: { searchParams: Promise<{ saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { saved, error } = await searchParams;

  const now = new Date();
  const startOfToday = lagosStartOfToday(now);
  const bookingSelect = {
    id: true, orderId: true, pickupLocation: true, destination: true, deliveryFee: true, platformFee: true, netAmount: true,
    status: true, trackingCode: true, estimatedDelivery: true, createdAt: true, packageDetails: true, codAmount: true,
    seller: { select: { name: true } }, rider: { select: { name: true } },
  } as const;

  const [newBookings, newQuotes, activeJobs, deliveredToday, pendingBookingCount, pendingQuoteCount, activeCount, riders, unremittedCash] = await Promise.all([
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
      select: { codCollected: true, codMethod: true, remittanceId: true },
    }),
  ]);

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
  const cashOwed = cashToPayIn(unremittedCash);
  const presence = riderPresence(riders, now);
  const activeRiders = riders.filter((rider) => rider.status === "active");
  const newCount = pendingBookingCount + pendingQuoteCount;
  const taking = partner.status === "active";
  const areas = partner.coverageZones.length ? partner.coverageZones.join(", ") : partner.city;

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={`${lagosGreeting(now)}, ${user.name.split(" ")[0]}`}
      sub={`${lagosDate(now, { weekday: "long", day: "numeric", month: "long" })} · ${areas}`}
      actions={<Pill tone={taking ? "success" : "muted"} dot>{taking ? "Taking new jobs" : "Not taking new jobs"}</Pill>}
    >
      <ActionNotice saved={saved} error={error} savedText="Done. The job list is up to date." />

      <StatGrid className="mb-5">
        <StatTile tone="card" label="New requests" value={newCount} />
        <StatTile tone="card" label="Active jobs" value={activeCount} />
        <StatTile tone="card" label="Delivered today" value={deliveredToday.length} />
        <StatTile tone="card" label="Earned today" value={naira(earnedToday)} />
      </StatGrid>

      <div className="grid gap-5 xl:[grid-template-columns:minmax(0,1fr)_minmax(360px,440px)]">
        <div className="grid min-w-0 content-start gap-5">
          <Card className="flex flex-wrap items-center gap-4 p-5">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-app-canvas"><Icon name="truck" size={22} /></span>
            <div className="min-w-0 flex-1">
              <h2 className="m-0 text-[17px] font-extrabold">
                {riders.length === 0 ? "No riders added yet" : `${presence.out} ${presence.out === 1 ? "rider" : "riders"} out · ${presence.offline} offline`}
              </h2>
              <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">
                {riders.length === 0 ? "Add the riders who carry your jobs so you can manage them here." : "Riders go online in the Shopinbos Riders app."}
              </p>
            </div>
            <PillLink href="/logistics/couriers" size="sm">{riders.length === 0 ? "Add a rider" : "See riders"}</PillLink>
          </Card>

          <section aria-labelledby="active-jobs" className="min-w-0">
            <div className="mb-3 flex items-baseline justify-between gap-3">
              <h2 id="active-jobs" className="m-0 text-[18px] font-extrabold">Active jobs</h2>
              <TextLink href="/logistics/bookings">All jobs</TextLink>
            </div>
            {activeJobs.length === 0 ? (
              <Card className="px-5 py-8 text-center text-[14.5px] text-app-ink-soft">No jobs on the road right now. Accepted jobs show up here.</Card>
            ) : (
              <ListCard>
                {activeJobs.map((job) => {
                  const stage = bookingStage(job.status);
                  return (
                    <ListRow key={job.id} href="/logistics/bookings">
                      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-app-ink-soft"><Icon name="box" size={18} /></span>
                      <div className="min-w-0 flex-1 basis-[180px]">
                        <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" />
                        <div className="truncate text-[13px] text-app-ink-soft">{jobId(job.id)} · {job.seller.name}</div>
                      </div>
                      <div className="min-w-0 basis-full sm:basis-[200px]"><StageDot tone={stage.tone}>{stage.label}</StageDot></div>
                      <div className={`min-w-0 truncate text-[13.5px] sm:w-[140px] ${job.rider ? "text-app-ink-soft" : "font-bold text-app-accent-ink"}`}>
                        {job.rider?.name ?? "No rider yet"}
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
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="m-0 text-[18px] font-extrabold">New requests</h2>
            {newCount > 0 && <TextLink href={pendingBookingCount ? "/logistics/bookings" : "/logistics/quotes"}>See all</TextLink>}
          </div>

          {newBookings.length + newQuotes.length === 0 && (
            <Card className="px-5 py-8 text-center text-[14.5px] text-app-ink-soft">
              No new requests. When a seller books you or asks for a price, it lands here.
            </Card>
          )}

          {newBookings.map((job) => {
            const collect = collectFor(job);
            return (
              <Card key={job.id} as="article" className="p-5">
                <div className="flex items-center justify-between gap-3">
                  <Pill tone="accent">Booked {timeAgo(job.createdAt, now)}</Pill>
                  <span className="text-[20px] font-extrabold">{naira(job.deliveryFee)}</span>
                </div>
                <div className="mt-3 min-w-0">
                  <Route from={job.pickupLocation} to={job.destination} className="block break-words text-[15px]" />
                  <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">
                    {packageSummary(job.packageDetails)} · {job.seller.name}
                    {job.estimatedDelivery ? ` · Deliver by ${lagosTime(job.estimatedDelivery)}, ${lagosDate(job.estimatedDelivery)}` : ""}
                  </p>
                </div>
                {collect > 0 && <div className="mt-3"><Pill tone="warning">Collect {naira(collect)}</Pill></div>}
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <form action={updateDeliveryBookingStatus}>
                    <input type="hidden" name="bookingId" value={job.id} />
                    <input type="hidden" name="status" value="cancelled" />
                    <input type="hidden" name="returnTo" value={RETURN} />
                    <SubmitButton tone="white" size="sm" aria-label={`Decline job ${jobId(job.id)}`}>Decline</SubmitButton>
                  </form>
                  <AcceptAssignForm bookingId={job.id} riders={activeRiders} returnTo={RETURN} className="flex-1" />
                </div>
              </Card>
            );
          })}

          {newQuotes.map((quote) => (
            <Card key={quote.id} as="article" className="p-5">
              <div className="flex items-center justify-between gap-3">
                <Pill tone="accent">{quote.expiresAt ? `Reply by ${lagosTime(quote.expiresAt)}` : `Asked ${timeAgo(quote.createdAt, now)}`}</Pill>
                <span className="text-[13.5px] font-bold text-app-ink-soft">Needs your price</span>
              </div>
              <div className="mt-3 min-w-0">
                <Route from={quote.pickupLocation} to={quote.destination} className="block break-words text-[15px]" />
                <p className="m-0 mt-0.5 text-[13.5px] text-app-ink-soft">
                  {packageSummary(quote.packageDetails)} · {quote.seller.name}
                  {quote.preferredDate ? ` · Wanted ${lagosDate(quote.preferredDate)}` : ""}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <form action={respondToDeliveryQuote}>
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="intent" value="reject" />
                  <input type="hidden" name="returnTo" value={RETURN} />
                  <SubmitButton tone="white" size="sm">Decline</SubmitButton>
                </form>
                <form action={respondToDeliveryQuote} className="flex min-w-0 flex-1 gap-2">
                  <input type="hidden" name="quoteId" value={quote.id} />
                  <input type="hidden" name="intent" value="respond" />
                  <input type="hidden" name="returnTo" value={RETURN} />
                  <label className="sr-only" htmlFor={`price-${quote.id}`}>Your price in naira</label>
                  <input
                    id={`price-${quote.id}`}
                    name="quotedPrice"
                    type="number"
                    min="1"
                    step="1"
                    required
                    inputMode="numeric"
                    defaultValue={partner.basePrice > 0 ? String(partner.basePrice) : ""}
                    placeholder="₦ price"
                    className={`${inputClass} h-10 min-w-[90px] flex-1 rounded-full`}
                  />
                  <SubmitButton size="sm">Send price</SubmitButton>
                </form>
              </div>
            </Card>
          ))}

          {(cashOwed > 0 || cashCollectedToday > 0 || cashOnActiveJobs > 0) && (
            <Card className="border-0 bg-[#FDF0D5] p-5">
              <CardHead
                title="Cash to pay in"
                action={<span className="text-[18px] font-extrabold">{naira(cashOwed)}</span>}
              />
              <p className="m-0 mt-1 text-[13.5px] leading-[1.5] text-[#5C4100]">
                Cash your riders collected on pay-on-delivery orders and you haven&apos;t paid in yet
                {cashCollectedToday > 0 ? ` · ${naira(cashCollectedToday)} collected today` : ""}
                {cashOnActiveJobs > 0 ? ` · ${naira(cashOnActiveJobs)} more to collect on active jobs` : ""}.
              </p>
              <PillLink href="/logistics/cash" tone="ink" size="sm" className="mt-3">Open cash</PillLink>
            </Card>
          )}
        </div>
      </div>
    </PartnerPage>
  );
}
