import type { Metadata } from "next";
import type { Prisma } from "@prisma/client";
import { pageWindow } from "@/lib/pagination";
import { Pagination } from "@/components/seller/Pagination";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { ensureLogisticsAccess, getLogisticsPartnerForUser } from "@/lib/role-queries";
import { updateDeliveryBookingStatus } from "@/app/actions/logistics";
import { EmptyState, FilterChips, ListCard, PillLink, SearchForm } from "@/components/app-kit";
import { messagesHref } from "@/lib/conversations/pure";
import { Icon } from "@/components/ui/Icon";
import { AcceptAssignForm, ReassignForm, riderSelect } from "@/components/logistics/dispatch";
import { CashToShop, DeclineJobForm, MarketJobFacts } from "@/components/logistics/market";
import { withOpenJobs } from "@/lib/logistics/dispatch-riders";
import { ensurePickupCoords } from "@/lib/logistics/geocode";
import { nextStatuses } from "@/lib/logistics/job-rules";
import { pickupWindowText } from "@shared/supplier-pickup";
import {
  ACTIVE_STATUSES,
  ON_ROAD_STATUSES,
  ActionNotice,
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
  type LogisticsT,
} from "@/components/logistics/kit";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 50;
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("jobs.title") };
}

const FILTERS: Array<{ key: string; label: string; statuses?: BookingStatusValue[] }> = [
  { key: "all", label: "All" },
  { key: "new", label: "New", statuses: ["pending"] },
  { key: "active", label: "Active", statuses: ACTIVE_STATUSES },
  { key: "issues", label: "Failed or cancelled", statuses: ["failed", "returned", "cancelled"] },
  { key: "declined", label: "Declined", statuses: ["declined"] },
  { key: "delivered", label: "Delivered", statuses: ["delivered"] },
];

function filterHref(key: string, q?: string) {
  const params = new URLSearchParams();
  if (key !== "all") params.set("status", key);
  if (q) params.set("q", q);
  const query = params.toString();
  return `/logistics/bookings${query ? `?${query}` : ""}`;
}

export default async function LogisticsBookingsPage({ searchParams }: { searchParams: Promise<{ status?: string; q?: string; saved?: string; error?: string; page?: string }> }) {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await getLogisticsPartnerForUser(user);
  ensureLogisticsAccess(partner);
  const { status, q: rawQ, saved, error, page } = await searchParams;
  const q = rawQ?.trim() || undefined;
  const filter = FILTERS.find((item) => item.key === status) ?? FILTERS[0];
  const t = await getT("logistics", "common");

  const base: Prisma.DeliveryBookingWhereInput = { logisticsPartnerId: partner.id };
  const search: Prisma.DeliveryBookingWhereInput = q
    ? {
        OR: [
          { pickupLocation: { contains: q, mode: "insensitive" } },
          { rider: { name: { contains: q, mode: "insensitive" } } },
          { destination: { contains: q, mode: "insensitive" } },
          { trackingCode: { contains: q, mode: "insensitive" } },
          { seller: { name: { contains: q, mode: "insensitive" } } },
          { id: { endsWith: q.replace(/^J-/i, "").toLowerCase() } },
        ],
      }
    : {};

  const where: Prisma.DeliveryBookingWhereInput = { ...base, ...search, ...(filter.statuses ? { status: { in: filter.statuses } } : {}) };
  const paging = pageWindow(page, await db.deliveryBooking.count({ where }), PAGE_SIZE);
  const [bookings, counts, ridersBase] = await Promise.all([
    db.deliveryBooking.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: paging.skip,
      take: paging.take,
      select: {
        id: true, pickupLocation: true, destination: true, deliveryFee: true, status: true, trackingCode: true,
        pickupWindowStart: true, pickupWindowEnd: true,
        estimatedDelivery: true, createdAt: true, packageDetails: true, notes: true, failedReason: true,
        codAmount: true, codCollected: true, codMethod: true, riderId: true, sellerId: true,
        pickupLat: true, pickupLng: true, pickupGeoSource: true, pickupGeocodedAt: true,
        // Logistics marketplace details (shown when present).
        service: true, sizeBand: true, pickupPointId: true, shipmentKey: true, readyAt: true, acceptBy: true, feePaidAt: true,
        declineReason: true, codRemittedAt: true, codConfirmedAt: true,
        seller: { select: { name: true } }, rider: { select: { name: true } },
      },
    }),
    db.deliveryBooking.groupBy({ by: ["status"], where: base, _count: { _all: true } }),
    db.logisticsTeamMember.findMany({ where: { logisticsPartnerId: partner.id, role: "rider", status: "active" }, orderBy: { name: "asc" }, select: riderSelect }),
  ]);
  const RETURN = "/logistics/bookings";
  const now = new Date();
  const pointIds = [...new Set(bookings.map((job) => job.pickupPointId).filter((id): id is string => Boolean(id)))];
  const points = pointIds.length ? await db.logisticsPickupPoint.findMany({ where: { id: { in: pointIds }, logisticsPartnerId: partner.id }, select: { id: true, name: true } }) : [];
  const pointName = new Map(points.map((point) => [point.id, point.name]));
  // Closest rider first: pickup coordinates for jobs that need a rider (geocoded once, stored on the job).
  const [riders, pickupGeo] = await Promise.all([
    withOpenJobs(partner.id, ridersBase),
    ensurePickupCoords(bookings.filter((job) => ["pending", ...ON_ROAD_STATUSES].includes(job.status as BookingStatusValue)), partner.country),
  ]);

  const countOf = (statuses?: BookingStatusValue[]) =>
    counts.filter((row) => !statuses || statuses.includes(row.status as BookingStatusValue)).reduce((sum, row) => sum + row._count._all, 0);

  return (
    <PartnerPage
      frame={{ user, partner }}
      title={t("jobs.title")}
      sub={t("jobs.sub")}
      toolbar={
        <>
          <FilterChips items={FILTERS.map((item) => ({ label: t.dynamic(`jobs.filter.${item.key}`, item.label), href: filterHref(item.key, q), count: countOf(item.statuses), active: item.key === filter.key }))} />
          <SearchForm action="/logistics/bookings" placeholder={t("jobs.searchPlaceholder")} defaultValue={q} keep={{ status: filter.key === "all" ? undefined : filter.key }} />
        </>
      }
    >
      <ActionNotice saved={saved} error={error} savedText={t("jobs.updated")} />

      {bookings.length === 0 ? (
        <EmptyState icon="box" title={q || filter.key !== "all" ? t("jobs.noMatchTitle") : t("jobs.emptyTitle")}>
          {q || filter.key !== "all" ? t("jobs.noMatchBody") : t("jobs.emptyBody")}
        </EmptyState>
      ) : (
        <ListCard>
          {bookings.map((job) => (
            <li key={job.id}>
              <details className="group">
                <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 hover:bg-app-canvas sm:flex-nowrap sm:px-5 [&::-webkit-details-marker]:hidden">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-app-line bg-app-canvas text-app-ink-soft"><Icon name="box" size={18} /></span>
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <Route from={job.pickupLocation} to={job.destination} className="block truncate text-[15px]" toLabel={t("kit.to")} />
                    {job.pickupWindowStart && <div className="text-[14.5px] font-extrabold text-app-accent-ink">{pickupWindowText(job.pickupWindowStart, job.pickupWindowEnd)}</div>}
                    <div className="truncate text-[15px] text-app-ink-soft">
                      {jobId(job.id)} · {job.seller.name} · {packageSummary(job.packageDetails, t)}
                    </div>
                  </div>
                  <div className="shrink-0"><StatusPill status={job.status} /></div>
                  <div className={`w-full min-w-0 truncate text-[15px] sm:w-[130px] ${job.rider || !ON_ROAD_STATUSES.includes(job.status as BookingStatusValue) ? "text-app-ink-soft" : "font-bold text-app-accent-ink"}`}>
                    {job.rider?.name ?? (job.status === "pending" ? t("jobs.notAccepted") : t("dispatch.noRider"))}
                  </div>
                  <div className="hidden w-[120px] shrink-0 text-[15px] text-app-ink-soft lg:block">
                    {lagosDate(job.createdAt, undefined, new Date(), t)}, {lagosTime(job.createdAt, t)}
                  </div>
                  <div className="ml-auto text-[15px] font-extrabold">{naira(job.deliveryFee)}</div>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-app-ink-soft transition group-open:rotate-180" aria-hidden>
                    <Icon name="chevDown" size={16} />
                  </span>
                </summary>

                <div className="border-t border-app-line bg-app-canvas/60 px-4 py-4 sm:px-5">
                  <div className="mb-3">
                    <PillLink href={messagesHref("logistics_partner", { with: job.sellerId, context: { kind: "booking", id: job.id } })} size="sm" icon="chat">{t("jobs.message", { name: job.seller.name })}</PillLink>
                  </div>
                  <div className="mb-3 empty:hidden"><MarketJobFacts job={job} pointName={job.pickupPointId ? pointName.get(job.pickupPointId) : null} now={now} t={t} /></div>
                  {job.notes && <p className="m-0 mb-3 text-[15px] text-app-ink-soft">{t("jobs.sellerNote", { note: job.notes })}</p>}
                  {job.status === "failed" && job.failedReason && <p className="m-0 mb-3 text-[15px] font-bold text-app-danger">{t("jobs.failedReason", { reason: job.failedReason })}</p>}
                  {job.codAmount ? (
                    <p className="m-0 mb-3 text-[15px] text-app-ink-soft">
                      {t("jobs.codCollect", { amount: naira(job.codAmount) })}
                      {job.codCollected !== null ? ` · ${job.codMethod === "transfer" ? t("jobs.collectedTransfer", { amount: naira(job.codCollected) }) : t("jobs.collectedCash", { amount: naira(job.codCollected) })}` : ""}
                    </p>
                  ) : null}
                  {job.status === "pending" ? (
                    <div className="flex flex-wrap items-start gap-2">
                      <DeclineJobForm bookingId={job.id} returnTo={RETURN} />
                      <AcceptAssignForm bookingId={job.id} riders={riders} returnTo={RETURN} className="flex-1 sm:max-w-[520px]" pickup={pickupGeo.get(job.id)} />
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      <CashToShop job={job} returnTo={RETURN} />
                      {!["delivered", "cancelled", "declined", "returned"].includes(job.status) && (
                        <div className="sm:max-w-[520px]">
                          <ReassignForm bookingId={job.id} riderId={job.riderId} riderName={job.rider?.name} riders={riders} returnTo={RETURN} pickup={pickupGeo.get(job.id)} />
                        </div>
                      )}
                      <JobUpdateForm job={job} t={t} />
                    </div>
                  )}
                </div>
              </details>
            </li>
          ))}
        </ListCard>
      )}
      <Pagination {...paging} base="/logistics/bookings" params={{ status: filter.key === "all" ? undefined : filter.key, q }} label={t("jobs.pages")} />
    </PartnerPage>
  );
}

type JobForForm = {
  id: string;
  status: string;
  trackingCode: string | null;
  estimatedDelivery: Date | null;
  codAmount: number | null;
  /** Marketplace jobs: doorstep jobs go out for delivery, pickup-point jobs wait at the point. */
  service?: string | null;
};

/** Stage first; tracking code and delivery time are folded away. Only the moves the job rules allow are offered, plus what an undelivered or cash-on-delivery job needs. */
function JobUpdateForm({ job, t }: { job: JobForForm; t: LogisticsT }) {
  const skip = job.service === "pickup_point" ? "out_for_delivery" : job.service ? "at_pickup_point" : null;
  const options = [job.status, ...nextStatuses(job.status).filter((status) => status !== skip)];
  const canFail = options.includes("failed") && job.status !== "failed";
  const canDeliver = options.includes("delivered") && job.status !== "delivered";
  const needsCash = canDeliver && (job.codAmount ?? 0) > 0;
  return (
    <form action={updateDeliveryBookingStatus} className="grid max-w-[720px] gap-3">
      <input type="hidden" name="bookingId" value={job.id} />
      <div className="min-w-0">
        <label htmlFor={`status-${job.id}`} className="mb-1.5 block text-[15px] font-bold">{t("jobs.status")}</label>
        <select id={`status-${job.id}`} name="status" defaultValue={job.status} className={inputClass}>
          {options.map((value) => (
            <option key={value} value={value}>{bookingStage(value, t).label}</option>
          ))}
        </select>
      </div>
      {(canFail || needsCash) && (
        <div className="grid gap-3 sm:grid-cols-2">
          {canFail && (
            <div className="min-w-0">
              <label htmlFor={`reason-${job.id}`} className="mb-1.5 block text-[15px] font-bold">{t("jobs.failedWhy")}</label>
              <input id={`reason-${job.id}`} name="failedReason" maxLength={300} placeholder={t("jobs.failedPlaceholder")} className={inputClass} />
            </div>
          )}
          {needsCash && (
            <>
              <div className="min-w-0">
                <label htmlFor={`cod-${job.id}`} className="mb-1.5 block text-[15px] font-bold">{t("jobs.codCollectedLabel")}</label>
                <input id={`cod-${job.id}`} name="codCollected" type="number" min="0" step="any" inputMode="decimal" defaultValue={job.codAmount ?? ""} className={inputClass} />
              </div>
              <div className="min-w-0">
                <label htmlFor={`codm-${job.id}`} className="mb-1.5 block text-[15px] font-bold">{t("jobs.paidBy")}</label>
                <select id={`codm-${job.id}`} name="codMethod" defaultValue="cash" className={inputClass}>
                  <option value="cash">{t("jobs.cashToRider")}</option>
                  <option value="transfer">{t("jobs.transferToSeller")}</option>
                </select>
              </div>
            </>
          )}
        </div>
      )}
      <details className="group">
        <summary className="cursor-pointer list-none text-[15px] font-bold text-app-ink-soft [&::-webkit-details-marker]:hidden">
          {t("jobs.moreOptions")} <span aria-hidden className="inline-block transition group-open:rotate-90">›</span>
        </summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div className="min-w-0">
            <label htmlFor={`tracking-${job.id}`} className="mb-1.5 block text-[15px] font-bold">{t("jobs.trackingCode")}</label>
            <input id={`tracking-${job.id}`} name="trackingCode" defaultValue={job.trackingCode ?? ""} className={inputClass} />
          </div>
          <div className="min-w-0">
            <label htmlFor={`eta-${job.id}`} className="mb-1.5 block text-[15px] font-bold">{t("jobs.estimatedDelivery")}</label>
            <input
              id={`eta-${job.id}`}
              name="estimatedDelivery"
              type="datetime-local"
              defaultValue={job.estimatedDelivery ? job.estimatedDelivery.toISOString().slice(0, 16) : ""}
              className={inputClass}
            />
          </div>
        </div>
      </details>
      <SubmitButton className="sm:justify-self-start">{t("jobs.update")}</SubmitButton>
    </form>
  );
}
