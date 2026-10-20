import Link from "next/link";
import { updateSupplierVerification, bulkUpdateSupplierVerification } from "@/app/actions/admin";
import { AppPage, EmptyState, FilterChips, ListCard, PillLink, Pill, SearchForm, Thumb } from "@/components/app-kit";
import {
  CountRow,
  DecisionButtons,
  OnboardingPill,
  onboardingSubmitted,
  VERIFICATION_STATUSES,
  VerificationPill,
  adminFrame,
  buttonClass,
  fieldClass,
  formatDate,
  verificationLabel,
  withParams,
} from "@/components/admin/AdminKit";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

const verificationStatuses: readonly string[] = VERIFICATION_STATUSES;

export default async function AdminSuppliersPage(props: { searchParams?: Promise<{ status?: string; q?: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");

  const searchParams = await props.searchParams;
  const statusFilter = searchParams?.status && verificationStatuses.includes(searchParams.status) ? searchParams.status : undefined;
  const searchQuery = searchParams?.q?.trim() || undefined;

  const where: Record<string, unknown> = {};
  if (statusFilter) {
    where.verificationStatus = statusFilter;
  }
  if (searchQuery) {
    where.OR = [
      { displayName: { contains: searchQuery, mode: "insensitive" } },
      { businessName: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const [suppliers, byStatus, total, submitted, suspended] = await Promise.all([
    db.supplier.findMany({
      where,
      orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
      take: 100,
      select: {
        id: true,
        businessName: true,
        displayName: true,
        slug: true,
        country: true,
        city: true,
        logoUrl: true,
        verificationStatus: true,
        status: true,
        trustScore: true,
        onboardingState: true,
        updatedAt: true,
        _count: { select: { products: true } },
      },
    }),
    db.supplier.groupBy({ by: ["verificationStatus"], _count: { _all: true } }),
    db.supplier.count(),
    db.supplier.count({ where: { onboardingState: { path: ["completed"], equals: true } } }),
    db.supplier.count({ where: { status: "suspended" } }),
  ]);

  const countFor = (status: string) => byStatus.find((row) => row.verificationStatus === status)?._count._all ?? 0;
  const selectedIds = suppliers.map((s) => s.id);
  const backTo = withParams("/admin/suppliers", { status: statusFilter, q: searchQuery });

  return (
    <AppPage
      frame={adminFrame(user, "Search suppliers")}
      title="Suppliers"
      sub="Check who a supplier is, decide if they can sell on the marketplace, and set how much buyers should trust them."
      toolbar={
        <>
          <FilterChips
            items={[
              { label: "All", count: total, href: withParams("/admin/suppliers", { q: searchQuery }), active: !statusFilter },
              ...(["pending", "verified", "unverified", "rejected", "suspended"] as const).map((status) => ({
                label: verificationLabel(status),
                count: countFor(status),
                href: withParams("/admin/suppliers", { status, q: searchQuery }),
                active: statusFilter === status,
              })),
            ]}
          />
          <SearchForm action="/admin/suppliers" defaultValue={searchQuery} placeholder="Search by name or slug" keep={{ status: statusFilter }} />
        </>
      }
    >
      <CountRow
        items={[
          { label: "All suppliers", value: total },
          { label: "Waiting for review", value: countFor("pending") },
          { label: "Verified", value: countFor("verified") },
          { label: "Onboarding sent", value: submitted },
          { label: "Suspended", value: suspended },
        ]}
      />

      {suppliers.length === 0 ? (
        <EmptyState icon="users" title={statusFilter || searchQuery ? "No suppliers match" : "No suppliers yet"} action={statusFilter || searchQuery ? <PillLink href="/admin/suppliers">Clear filters</PillLink> : undefined}>
          {statusFilter || searchQuery ? "Try another filter or search word." : "Suppliers show up here as soon as they sign up."}
        </EmptyState>
      ) : (
        <>
          <form action={bulkUpdateSupplierVerification} className="mb-4 flex flex-wrap items-center gap-2 rounded-[18px] border border-app-line bg-white px-4 py-3">
            {selectedIds.map((id) => (
              <input key={id} type="hidden" name="supplierIds" value={id} />
            ))}
            <input type="hidden" name="redirectTo" value={backTo} />
            <label htmlFor="bulk-supplier-status" className="mr-1 text-[14px] font-bold">
              Set all {suppliers.length} shown to
            </label>
            <select id="bulk-supplier-status" name="status" required defaultValue="" className={`${fieldClass} w-auto min-w-[180px]`}>
              <option value="" disabled>Choose a status</option>
              {VERIFICATION_STATUSES.map((s) => (
                <option key={s} value={s}>{verificationLabel(s)}</option>
              ))}
            </select>
            <button type="submit" className={buttonClass("white", "sm")}>Apply to all</button>
          </form>

          <ListCard>
            {suppliers.map((row) => (
              <li key={row.id} className="px-4 py-3.5 sm:px-5">
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 lg:flex-nowrap">
                  <Thumb src={row.logoUrl} label={row.displayName} size={44} />
                  <div className="min-w-0 flex-1 basis-[200px]">
                    <Link href={`/admin/suppliers/${row.id}`} className="block truncate text-[15px] font-extrabold text-app-ink no-underline hover:underline">
                      {row.displayName}
                    </Link>
                    <div className="truncate text-[13px] text-app-ink-soft">
                      {row.businessName} · /{row.slug} · {row.city}, {row.country}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <VerificationPill status={row.verificationStatus} />
                    {row.status !== "active" && <Pill tone="danger">{row.status === "suspended" ? "Account suspended" : row.status}</Pill>}
                    <OnboardingPill status={onboardingSubmitted(row.onboardingState) ? "submitted" : "draft"} />
                  </div>
                  <div className="w-full text-[13px] text-app-ink-soft sm:w-auto lg:w-[150px] lg:shrink-0 lg:text-right">
                    {row._count.products} products · trust {row.trustScore}
                    <div>Updated {formatDate(row.updatedAt)}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PillLink href={`/admin/suppliers/${row.id}`} size="sm" icon="file">Documents</PillLink>
                    {row.verificationStatus !== "verified" && (
                      <DecisionButtons
                        action={updateSupplierVerification}
                        followUp
                        fields={{ supplierId: row.id, trustScore: String(row.trustScore), redirectTo: backTo }}
                        approve="verified"
                        reject="rejected"
                        subject={row.displayName}
                      />
                    )}
                  </div>
                </div>

                <details className="group mt-2">
                  <summary className="inline-flex min-h-[40px] cursor-pointer list-none items-center gap-1 rounded-full text-[13px] font-bold text-app-ink-soft hover:text-app-ink [&::-webkit-details-marker]:hidden">
                    <span className="group-open:hidden">Change status or trust score</span>
                    <span className="hidden group-open:inline">Hide</span>
                  </summary>
                  <form action={updateSupplierVerification} className="mt-1 flex flex-wrap items-end gap-3 rounded-[16px] bg-app-canvas p-3">
                    <input type="hidden" name="supplierId" value={row.id} />
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
                      <label htmlFor={`trust-${row.id}`} className="mb-1 block text-[12.5px] font-bold">Trust (0-100)</label>
                      <input id={`trust-${row.id}`} name="trustScore" type="number" min="0" max="100" defaultValue={row.trustScore} className={fieldClass} />
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
