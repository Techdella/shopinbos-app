import { updateLogisticsVerification, bulkUpdateLogisticsVerification } from "@/app/actions/admin";
import { StatusPill } from "@/components/ops/OpsPrimitives";
import { DataTable, RolePage, formatDate, formatMoney } from "@/components/role/RolePage";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

const verificationStatuses = ["unverified", "pending", "verified", "rejected", "suspended"];

function onboardingSubmitted(state: unknown) {
  return Boolean(state && typeof state === "object" && !Array.isArray(state) && (state as { completed?: boolean }).completed === true);
}

export default async function AdminLogisticsPartnersPage(props: { searchParams?: Promise<{ status?: string; q?: string }> }) {
  await requireRole(["admin"], "/admin/login");

  const searchParams = await props.searchParams;
  const statusFilter = searchParams?.status;
  const searchQuery = searchParams?.q?.trim();

  const where: Record<string, unknown> = {};
  if (statusFilter && verificationStatuses.includes(statusFilter)) {
    where.verificationStatus = statusFilter;
  }
  if (searchQuery) {
    where.OR = [
      { displayName: { contains: searchQuery, mode: "insensitive" } },
      { companyName: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const partners = await db.logisticsPartner.findMany({
    where,
    orderBy: [{ verificationStatus: "asc" }, { updatedAt: "desc" }],
    take: 100,
    select: {
      id: true,
      companyName: true,
      displayName: true,
      slug: true,
      country: true,
      city: true,
      verificationStatus: true,
      status: true,
      reliabilityScore: true,
      onboardingState: true,
      basePrice: true,
      updatedAt: true,
      coverageZones: true,
      deliveryTypes: true,
    },
  });

  const selectedIds = partners.map((p) => p.id);

  return (
    <RolePage
      role="admin"
      eyebrow="Admin logistics"
      title="Logistics Partners"
      description="Approve delivery partners, adjust reliability scores, and keep the public logistics directory limited to active verified operators."
      metrics={[
        { label: "Partners", value: String(partners.length) },
        { label: "Pending", value: String(partners.filter((partner) => partner.verificationStatus === "pending").length) },
        { label: "Verified", value: String(partners.filter((partner) => partner.verificationStatus === "verified").length) },
        { label: "Submitted", value: String(partners.filter((partner) => onboardingSubmitted(partner.onboardingState)).length) },
        { label: "Suspended", value: String(partners.filter((partner) => partner.status === "suspended").length) },
      ]}
    >
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <select
            name="status"
            defaultValue={statusFilter ?? ""}
            onChange={(e) => e.target.form?.requestSubmit()}
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none"
          >
            <option value="">All verification statuses</option>
            {verificationStatuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <input
            name="q"
            type="search"
            placeholder="Search partners..."
            defaultValue={searchQuery ?? ""}
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none min-w-[200px]"
          />
          <button type="submit" className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-navy">
            Filter
          </button>
          {statusFilter || searchQuery ? (
            <a href="/admin/logistics-partners" className="text-sm text-muted underline">Clear</a>
          ) : null}
        </form>

        <form action={bulkUpdateLogisticsVerification} className="flex items-center gap-2">
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="logisticsPartnerIds" value={id} />
          ))}
          <input type="hidden" name="redirectTo" value="/admin/logistics-partners" />
          <select
            name="status"
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none"
          >
            <option value="">Bulk action...</option>
            {verificationStatuses.map((s) => (
              <option key={s} value={s}>{s.replace(/_/g, " ")}</option>
            ))}
          </select>
          <button type="submit" className="rounded-pill border border-[rgb(14_42_56_/_0.12)] bg-white px-4 py-2 text-sm font-semibold text-navy">
            Apply to all
          </button>
        </form>
      </div>

      <DataTable
        title="Partner Moderation"
        empty="No logistics partners yet."
        rows={partners}
        columns={[
          {
            label: "Company",
            value: (row) => (
              <div className="min-w-[180px]">
                <div className="font-semibold text-navy">{row.displayName}</div>
                <div className="text-xs text-muted">{row.companyName}</div>
                <div className="text-xs text-muted">/{row.slug}</div>
              </div>
            ),
          },
          { label: "Location", value: (row) => `${row.city}, ${row.country}` },
          {
            label: "Coverage",
            value: (row) => (
              <div className="min-w-[160px] text-xs leading-5 text-muted">
                <div>{row.coverageZones.length} zones</div>
                <div>{row.deliveryTypes.join(", ") || "No delivery types"}</div>
              </div>
            ),
          },
          {
            label: "Onboarding",
            value: (row) => (
              <StatusPill
                status={
                  onboardingSubmitted(row.onboardingState) ? "submitted" : "draft"
                }
              />
            ),
          },
          { label: "Verification", value: (row) => <StatusPill status={row.verificationStatus} /> },
          { label: "Status", value: (row) => <StatusPill status={row.status} /> },
          { label: "Base", value: (row) => formatMoney(row.basePrice) },
          { label: "Updated", value: (row) => formatDate(row.updatedAt) },
          {
            label: "Moderation",
            value: (row) => (
              <form action={updateLogisticsVerification} className="grid min-w-[260px] gap-2">
                <input type="hidden" name="logisticsPartnerId" value={row.id} />
                <input type="hidden" name="redirectTo" value="/admin/logistics-partners" />
                <div className="flex items-center gap-2">
                  <select
                    name="status"
                    defaultValue={row.verificationStatus}
                    className="flex-1 rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none"
                  >
                    {verificationStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status.replace(/_/g, " ")}
                      </option>
                    ))}
                  </select>
                  <input
                    name="reliabilityScore"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={row.reliabilityScore}
                    className="w-[60px] rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-2 py-2 text-[13px] text-navy outline-none"
                    title="Reliability score"
                  />
                  <button
                    type="submit"
                    className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-navy"
                  >
                    Save
                  </button>
                </div>
                <input
                  name="note"
                  placeholder="Moderation note..."
                  className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-1.5 text-[12px] text-navy outline-none"
                />
              </form>
            ),
          },
        ]}
      />
    </RolePage>
  );
}
