import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateDeliveryBookingStatus } from "@/app/actions/logistics";
import { EmptyState, FilterChips, ListCard, SearchForm } from "@/components/app-kit";
import { Icon } from "@/components/ui/Icon";
import {
  ACTIVE_STATUSES,
  ActionNotice,
  BOOKING_STATUSES,
  PartnerPage,
  Route,
  StatusPill,
  SubmitButton,
  bookingStage,
  inputClass,
  jobId,
  lagosDate,
  lagosTime,
  naira,
  packageSummary,
  type BookingStatusValue,
} from "@/components/logistics/kit";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Jobs" };

const FILTERS: Array<{ key: string; label: string; statuses?: BookingStatusValue[] }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New", statuses: ["pending"] },
  { key: "active", label: "Active", statuses: ACTIVE_STATUSES },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
  { key: "issues", label: "Failed or cancelled", statuses: ["failed", "cancelled"] },
];

function filterHref(key: string, q?: string) {
  const params = new URLSearchParams();
  if (key !== "all") params.set("status", key);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/logistics/bookings${query ? `?${query}` : ""}`;
}

export default async function LogisticsBookingsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; saved?: string; error?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { status, q: rawQ, saved, error } = await searchParams;
  const q = rawQ?.trim() || undefined;
  const filter = FILTERS.find((item) => item.key === status) ?? FILTERS[0];

  const base: Prisma.DeliveryBookingWhereInput = { logisticsPartnerId: partner.id };
  const search: Prisma.DeliveryBookingWhereInput = q
    ? {
        OR: [
          { pickupLocation: { contains: q, mode: "insensitive" } },
          { destination: { contains: q, mode: "insensitive" } },
          { trackingCode: { contains: q, mode: "insensitive" } },
          { seller: { name: { contains: q, mode: "insensitive" } } },
          { id: { endsWith: q.replace(/^J-/i, "").toLowerCase() } },
        ],
      }
    : {};

  const [bookings, counts] = await Promise.all([
    db.deliveryBooking.findMany({
      where: { ...base, ...search, ...(filter.statuses ? { status: { in: filter.statuses } } : {}) },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true, pickupLocation: true, destination: true, deliveryFee: true, status: true, trackingCode: true,
        estimatedDelivery: true, createdAt: true, packageDetails: true, notes: true,
        seller: { select: { name: true } },
      },
    }),
    db.deliveryBooking.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
  ]);

  const countOf = (statuses?: BookingStatusValue[]) =>
    counts.filter((row) => !statuses || statuses.includes(row.status as BookingStatusValue)).reduce((sum, row) => sum + row._count._all, 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title="Jobs"
      sub="Every delivery sellers booked with you. Accept new ones, then move each job along as your rider picks up and delivers."
      toolbar={
        <>
          <FilterChips items={FILTERS.map((item) => ({ label: item.label, href: filterHref(item.key, q), count: countOf(item.statuses), active: item.key === filter.key }))} />
          <SearchForm action="/logistics/bookings" placeholder="Search route, seller or tracking code" defaultValue={q} keep={{ status: filter.key === "all" ? undefined : filter.key }} />
        </>
      }
    >
      <ActionNotice saved={saved} error={error} savedText="Job updated." />

      {bookings.length === 0 ? (
        <EmptyState icon="box" title={q || filter.key !== "all" ? "No jobs match" : "No jobs yet"}>
          {q || filter.key !== "all" ? "Try another filter or search." : "When a seller books a delivery with you, the job shows up here."}
        </EmptyState>
      ) : (
        <ListCard>
          {bookings.map((job) => (
            <li key={job.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 hover:bg-app-canvas sm:flex-nowrap sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-app-ink-soft"><Icon name="box" size={18} /></span>
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" />
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {jobId(job.id)} · {job.seller.name} · {packageSummary(job.packageDetails)}
                    </div>
                  </div>
                  <div className="shrink-0"><StatusPill status={job.status} /></div>
                  <div className="hidden w-[120px] shrink-0 text-[13px] text-app-ink-soft lg:block">
                    {lagosDate(job.createdAt)}, {lagosTime(job.createdAt)}
                  </div>
                  <div className="ml-auto text-[15px] font-extrabold">{naira(job.deliveryFee)}</div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink-soft transition group-open:rotate-180" aria-hidden>
                    <Icon name="chevDown" size={16} />
                  </span>
                </summary>

                <div className="border-t border-app-line bg-app-canvas/60 px-4 py-4 sm:px-5">
                  {job.notes && <p className="m-0 mb-3 text-[13.5px] text-app-ink-soft">Seller note: {job.notes}</p>}
                  <form action={updateDeliveryBookingStatus} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:items-end">
                    <input type="hidden" name="bookingId" value={job.id} />
                    <div className="min-w-0">
                      <label htmlFor={`status-${job.id}`} className="mb-1.5 block text-[13px] font-bold">Stage</label>
                      <select id={`status-${job.id}`} name="status" defaultValue={job.status} className={inputClass}>
                        {BOOKING_STATUSES.map((value) => (
                          <option key={value} value={value}>{bookingStage(value).label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`tracking-${job.id}`} className="mb-1.5 block text-[13px] font-bold">Tracking code</label>
                      <input id={`tracking-${job.id}`} name="trackingCode" defaultValue={job.trackingCode ?? ""} placeholder="Optional" className={inputClass} />
                    </div>
                    <div className="min-w-0">
                      <label htmlFor={`eta-${job.id}`} className="mb-1.5 block text-[13px] font-bold">Estimated delivery</label>
                      <input
                        id={`eta-${job.id}`}
                        name="estimatedDelivery"
                        type="datetime-local"
                        defaultValue={job.estimatedDelivery ? job.estimatedDelivery.toISOString().slice(0, 16) : ""}
                        className={inputClass}
                      />
                    </div>
                    <SubmitButton className="sm:col-span-2 xl:col-span-1">Update job</SubmitButton>
                  </form>
                </div>
              </details>
            </li>
          ))}
        </ListCard>
      )}
    </PartnerPage>
  );
}
