import Link from "next/link";
import { updateLogisticsVerification, bulkUpdateLogisticsVerification } from "@/app/actions/admin";
import { AppPage, EmptyState, FilterChips, ListCard, PillLink, Pill, SearchForm, Thumb } from "@/components/app-kit";
import {
  CountRow,
  DecisionButtons,
  OnboardingPill,
  onboardingSubmitted,
  VERIFICATION_STATUSES,
  adminFrame,
  buttonClass,
  fieldClass,
  formatDate,
  formatMoney,
  verificationLabel,
  withParams,
} from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { SERVICE_LABELS, type PartnerService } from "@shared/delivery-market";
import { BADGE_LABELS, isPartnerBadge, partnerVerificationState } from "@shared/partner-tiers";
import { STATE_LABELS, STATE_TONES } from "./[id]/TierPanel";
import { reviewQueue } from "./review-queue.server";

const verificationStatuses: readonly string[] = VERIFICATION_STATUSES;

export default async function AdminLogisticsPartnersPage(props: { searchParams?: Promise<{ status?: string; q?: string; view?: string; saved?: string; error?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");

  const searchParams = await props.searchParams;
  const statusFilter = searchParams?.status && verificationStatuses.includes(searchParams.status) ? searchParams.status : undefined;
  const searchQuery = searchParams?.q?.trim() || undefined;
  // "Waiting for review": partners who sent their tier verification, or have an item waiting for the team.
  const reviewView = searchParams?.view === "review";
  const queue = await reviewQueue();
  const waiting = new Map(queue.map((entry) => [entry.id, entry.pending]));

  const where: Record<string, unknown> = {};
  if (reviewView) where.id = { in: queue.map((entry) => entry.id) };
  if (statusFilter) {
    where.verificationStatus = statusFilter;
  }
  if (searchQuery) {
    where.OR = [
      { displayName: { contains: searchQuery, mode: "insensitive" } },
      { companyName: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const [partners, byStatus, total, submitted, suspended] = await Promise.all([
    db.logisticsPartner.findMany({
      where,
      orderBy: reviewView ? [{ kycSubmittedAt: { sort: "asc", nulls: "last" } }, { updatedAt: "asc" }] : [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        companyName: true,
        displayName: true,
        slug: true,
        country: true,
        city: true,
        logoUrl: true,
        verificationStatus: true,
        verificationTier: true,
        kycSubmittedAt: true,
        badges: true,
        status: true,
        reliabilityScore: true,
        basePrice: true,
        coverageZones: true,
        deliveryTypes: true,
        onboardingState: true,
        services: true,
        deliveryAreas: true,
        cacNumber: true,
        offersPayOnDelivery: true,
        updatedAt: true,
      },
    }),
    db.logisticsPartner.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
    db.logisticsPartner.count(),
    db.logisticsPartner.count({ where: { onboardingState: { path: ["completed"], equals: true } } }),
    db.logisticsPartner.count({ where: { status: "suspended" } }),
  ]);
  // Customers' open delivery problems per partner (logistics marketplace), and the total for the link.
  const openIssues = await db.deliveryIssue.groupBy({ by: ["logisticsPartnerId"], where: { status: "open", logisticsPartnerId: { in: partners.map((row) => row.id) } }, _count: { _all: true } });
  const openIssuesTotal = await db.deliveryIssue.count({ where: { status: "open" } });
  const issuesFor = (id: string) => openIssues.find((row) => row.logisticsPartnerId === id)?._count._all ?? 0;

  const countFor = (status: string) => byStatus.find((row) => row.verificationStatus === status)?._count._all ?? 0;
  const selectedIds = partners.map((s) => s.id);
  const backTo = withParams("/admin/logistics-partners", { status: statusFilter, q: searchQuery, view: reviewView ? "review" : undefined });

  return (
    <AppPage
      frame={adminFrame(user, "Search logistics partners")}
      title="Logistics partners"
      sub="Check delivery companies before sellers can book them. Only active, verified partners appear in the public logistics directory."
      toolbar={
        <>
          <FilterChips
            items={[
              { label: "All", count: total, href: withParams("/admin/logistics-partners", { q: searchQuery }), active: !statusFilter && !reviewView },
              { label: "Waiting for review", count: queue.length, href: withParams("/admin/logistics-partners", { view: "review", q: searchQuery }), active: reviewView && !statusFilter },
              ...(["pending", "verified", "unverified", "rejected", "suspended"] as const).map((status) => ({
                label: verificationLabel(status),
                count: countFor(status),
                href: withParams("/admin/logistics-partners", { status, q: searchQuery }),
                active: statusFilter === status && !reviewView,
              })),
            ]}
          />
          <SearchForm action="/admin/logistics-partners" defaultValue={searchQuery} placeholder="Search by name or slug" keep={{ status: statusFilter, view: reviewView ? "review" : undefined }} />
          <PillLink href="/admin/logistics-partners/tier-rules" size="sm" icon="settings">Tier rules</PillLink>
        </>
      }
    >
      {(searchParams?.saved || searchParams?.error) && (
        <p role="status" className={`mb-4 rounded-[14px] px-4 py-3 text-[14.5px] font-bold ${searchParams.error ? "bg-app-danger-tint text-app-danger" : "bg-app-success-tint text-app-success"}`}>
          {searchParams.error ?? searchParams.saved}
        </p>
      )}




      <CountRow
        items={[
          { label: "All partners", value: total },
          { label: "Waiting for review", value: queue.length },
          { label: "Verified", value: countFor("verified") },
          { label: "Onboarding sent", value: submitted },
          { label: "Suspended", value: suspended },
        ]}
      />

      {openIssuesTotal > 0 && (
        <p className="mb-4 flex flex-wrap items-center gap-2 rounded-[18px] border border-app-line bg-white px-4 py-3 text-[14px]">
          <span className="font-bold">{openIssuesTotal} open delivery problem{openIssuesTotal === 1 ? "" : "s"} from customers.</span>
          <Link href="/admin/delivery-issues" className="font-extrabold text-app-accent-ink no-underline hover:underline">See delivery problems</Link>
        </p>
      )}

      {partners.length === 0 ? (
        <EmptyState icon="truck" title={reviewView && !searchQuery ? "Nothing waiting for review" : statusFilter || searchQuery ? "No partners match" : "No logistics partners yet"} action={statusFilter || searchQuery ? <PillLink href="/admin/logistics-partners">Clear filters</PillLink> : undefined}>
          {statusFilter || searchQuery ? "Try another filter or search word." : "Delivery partners show up here as soon as they sign up."}
        </EmptyState>
      ) : (
        <>
          <form action={bulkUpdateLogisticsVerification} className="mb-4 flex flex-wrap items-center gap-2 rounded-[18px] border border-app-line bg-white px-4 py-3">
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="logisticsPartnerIds" value={id} />
            ))}
            <input type="hidden" name="redirectTo" value={backTo} />
            <label htmlFor="bulk-logistics-status" className="mr-1 text-[14px] font-bold">
              Set all {partners.length} shown to
            </label>
            <select id="bulk-logistics-status" name="status" required defaultValue="" className={`${fieldClass} w-auto min-w-[180px]`}>
              <option value="" disabled>Choose a status</option>
              {VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>{verificationLabel(s)}</option>
              ))}
            </select>
            <button type="submit" className={buttonClass("white", "sm")}>Apply to all</button>
          </form>

          <ListCard>
            {partners.map((row) => (
              <li key={row.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:flex-nowrap">
                  <Thumb src={row.logoUrl} label={row.displayName} size={44} />
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <Link href={`/admin/logistics-partners/${row.id}`} className="block truncate text-[15px] font-extrabold text-app-ink no-underline hover:underline">
                      {row.displayName}
                    </Link>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {row.companyName} · /{row.slug} · {row.city}, {row.country}
                    </div>
                    {waiting.get(row.id)?.length ? (
                      <div className="truncate text-[13px] font-bold text-[#8A5A00]">
                        To check: {waiting.get(row.id)!.join(", ")}{row.kycSubmittedAt ? ` · sent ${formatDate(row.kycSubmittedAt)}` : ""}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Pill tone={STATE_TONES[partnerVerificationState(row)]}>{STATE_LABELS[partnerVerificationState(row)]}</Pill>
                    {row.badges.filter(isPartnerBadge).map((badge) => <Pill key={badge} tone="info">{BADGE_LABELS[badge]}</Pill>)}
                    {row.status !== "active" && <Pill tone={row.status === "paused" ? "warning" : "danger"}>{row.status === "suspended" ? "Account suspended" : row.status === "paused" ? "Paused by partner" : row.status}</Pill>}
                    {issuesFor(row.id) > 0 && <Pill tone="warning">{issuesFor(row.id)} open problem{issuesFor(row.id) === 1 ? "" : "s"}</Pill>}
                    <OnboardingPill status={onboardingSubmitted(row.onboardingState) ? "submitted" : "draft"} />
                  </div>
                  <div className="w-full text-[13px] text-app-ink-soft sm:w-auto lg:w-[200px] lg:shrink-0 lg:text-right">
                    {row.coverageZones.length} zones · from {formatMoney(row.basePrice)}
                    <div className="truncate">reliability {row.reliabilityScore} · {row.deliveryTypes.join(", ") || "no delivery types"}</div>
                    <div className="truncate">
                      {row.services.length ? row.services.map((service) => SERVICE_LABELS[service as PartnerService] ?? service).join(", ") : "No services set"}
                      {row.deliveryAreas.length ? ` · delivers to ${row.deliveryAreas.length} area${row.deliveryAreas.length === 1 ? "" : "s"}` : ""}
                      {row.offersPayOnDelivery ? " · POD" : ""}
                    </div>
                    <div>{row.cacNumber ? `CAC ${row.cacNumber} · ` : ""}Updated {formatDate(row.updatedAt)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PillLink href={`/admin/logistics-partners/${row.id}`} size="sm" icon="file">Documents</PillLink>
                    {row.verificationStatus !== "verified" && (
                      <DecisionButtons
                        action={updateLogisticsVerification}
                        followUp
                        fields={{ logisticsPartnerId: row.id, reliabilityScore: String(row.reliabilityScore), redirectTo: backTo }}
                        approve="verified"
                        reject="rejected"
                        subject={row.displayName}
                      />
                    )}
                  </div>
                </div>

                <details className="group mt-2">
                  <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-1 rounded-full text-[13px] font-bold text-app-ink-soft hover:text-app-ink [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Change status or reliability score</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <form action={updateLogisticsVerification} className="mt-1 flex flex-wrap items-end gap-3 rounded-[16px] bg-app-canvas p-3">
                    <input type="hidden" name="logisticsPartnerId" value={row.id} />
                    <input type="hidden" name="redirectTo" value={backTo} />
                    <div className="min-w-[180px] flex-1 sm:flex-none">
                      <label htmlFor={`status-${row.id}`} className="mb-1 block text-[12.5px] font-bold">Verification</label>
                      <select id={`status-${row.id}`} name="status" defaultValue={row.verificationStatus} className={fieldClass}>
                        {VERIFICATION_STATUSES.map((status) => (
                          <option key={status} value={status}>{verificationLabel(status)}</option>
                        ))}
                      </select>
                    </div>
                    <div className="w-[120px]">
                      <label htmlFor={`reliability-${row.id}`} className="mb-1 block text-[12.5px] font-bold">Reliability (0-100)</label>
                      <input id={`reliability-${row.id}`} name="reliabilityScore" type="number" min="0" max="100" defaultValue={row.reliabilityScore} className={fieldClass} />
                    </div>
                    <button type="submit" className={buttonClass("ink", "sm")}>Save</button>
                  </form>
                </details>
              </li>
            ))}
          </ListCard>
        </>
      )}
    </AppPage>
  );
}
