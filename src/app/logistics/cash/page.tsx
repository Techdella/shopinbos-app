import type { Metadata } from "next";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { EmptyState, ListCard, ListRow, StatGrid, StatTile } from "@/components/app-kit";
import {
  ACTIVE_STATUSES,
  PartnerPage,
  Route,
  StatusPill,
  cashToCollect,
  jobId,
  lagosDate,
  lagosStartOfToday,
  naira,
  type BookingStatusValue,
} from "@/components/logistics/kit";

// Cash on delivery: jobs whose store order is paid in cash when the parcel arrives.

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Cash on delivery" };

const DAY = 24 * 60 * 60 * 1000;

export default async function LogisticsCashPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);

  const bookings = await db.deliveryBooking.findMany({
    where: { logisticsPartnerId: partner.id, orderId: { not: null }, status: { notIn: ["cancelled"] } },
    orderBy: { createdAt: "desc" },
    take: 300,
    select: {
      id: true, orderId: true, pickupLocation: true, destination: true, status: true, deliveredAt: true, createdAt: true,
      seller: { select: { name: true } },
    },
  });
  const orderIds = bookings.map((booking) => booking.orderId).filter((id): id is string => Boolean(id));
  const orders = orderIds.length
    ? await db.retailOrder.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, total: true, status: true, paymentMethod: true } })
    : [];
  const orderById = new Map(orders.map((order) => [order.id, order]));

  const cashJobs = bookings
    .map((booking) => {
      const order = booking.orderId ? orderById.get(booking.orderId) : undefined;
      return { ...booking, order, cash: cashToCollect(order) };
    })
    .filter((job) => job.cash > 0);

  const startOfToday = lagosStartOfToday();
  const monthAgo = new Date(startOfToday.getTime() - 29 * DAY);
  const isActive = (status: string) => status === "pending" || ACTIVE_STATUSES.includes(status as BookingStatusValue);
  const toCollect = cashJobs.filter((job) => isActive(job.status));
  const collected = cashJobs.filter((job) => job.status === "delivered");
  const sum = (rows: typeof cashJobs) => rows.reduce((total, job) => total + job.cash, 0);
  const collectedToday = collected.filter((job) => (job.deliveredAt ?? job.createdAt) >= startOfToday);
  const collectedMonth = collected.filter((job) => (job.deliveredAt ?? job.createdAt) >= monthAgo);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Cash on delivery"
      sub="Jobs where your rider collects cash from the customer when the parcel arrives."
    >
      <StatGrid className="mb-5 md:grid-cols-3">
        <StatTile tone="card" label="To collect on open jobs" value={naira(sum(toCollect))} hint={`${toCollect.length} ${toCollect.length === 1 ? "job" : "jobs"}`} />
        <StatTile tone="card" label="Collected today" value={naira(sum(collectedToday))} hint={`${collectedToday.length} delivered`} />
        <StatTile tone="card" label="Collected, last 30 days" value={naira(sum(collectedMonth))} hint={`${collectedMonth.length} delivered`} className="col-span-2 md:col-span-1" />
      </StatGrid>

      {cashJobs.length === 0 ? (
        <EmptyState icon="card" title="No cash jobs yet">
          When a seller books you for a pay-on-delivery order, the amount your rider must collect shows here.
        </EmptyState>
      ) : (
        <div className="grid gap-5 2xl:grid-cols-2">
          {[
            { id: "to-collect", title: "To collect", rows: toCollect, empty: "Nothing to collect on open jobs." },
            { id: "collected", title: "Collected", rows: collected.slice(0, 50), empty: "No cash collected yet." },
          ].map((section) => (
            <section key={section.id} aria-labelledby={section.id} className="min-w-0">
              <h2 id={section.id} className="m-0 mb-3 text-[18px] font-extrabold">{section.title}</h2>
              {section.rows.length === 0 ? (
                <div className="rounded-[22px] border border-app-line bg-white px-5 py-8 text-center text-[14.5px] text-app-ink-soft">{section.empty}</div>
              ) : (
                <ListCard>
                  {section.rows.map((job) => (
                    <ListRow key={job.id}>
                      <div className="min-w-0 flex-1 basis-[200px]">
                        <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" />
                        <div className="truncate text-[13px] text-app-ink-soft">
                          {jobId(job.id)} · {job.seller.name}{job.order ? ` · order ${job.order.orderNumber}` : ""} · {lagosDate(job.deliveredAt ?? job.createdAt)}
                        </div>
                      </div>
                      <StatusPill status={job.status} />
                      <div className="ml-auto text-[15px] font-extrabold">{naira(job.cash)}</div>
                    </ListRow>
                  ))}
                </ListCard>
              )}
            </section>
          ))}
        </div>
      )}
    </PartnerPage>
  );
}
