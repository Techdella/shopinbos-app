import { updateSupplierVerification, bulkUpdateSupplierVerification } from "@/app/actions/admin";
import { StatusPill } from "@/components/ops/OpsPrimitives";
import { DataTable, RolePage, formatDate } from "@/components/role/RolePage";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

const verificationStatuses = ["unverified", "pending", "verified", "rejected", "suspended"];

function onboardingSubmitted(state: unknown) {
  return Boolean(state && typeof state === "object" && !Array.isArray(state) && (state as { completed?: boolean }).completed === true);
}

export default async function AdminSuppliersPage(props: { searchParams?: Promise<{ status?: string; q?: string }> }) {
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
      { businessName: { contains: searchQuery, mode: "insensitive" } },
      { slug: { contains: searchQuery, mode: "insensitive" } },
    ];
  }

  const suppliers = await db.supplier.findMany({
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
      verificationStatus: true,
      status: true,
      trustScore: true,
      onboardingState: true,
      updatedAt: true,
      _count: { select: { products: true } },
    },
  });

  const selectedIds = suppliers.map((s) => s.id);

  return (
    <RolePage
      role="admin"
      eyebrow="Admin suppliers"
      title="Suppliers"
      description="Approve supplier identity, keep public eligibility aligned, and tune trust scores without leaving the canonical admin namespace."
      metrics={[
        { label: "Suppliers", value: String(suppliers.length) },
        { label: "Pending", value: String(suppliers.filter((supplier) => supplier.verificationStatus === "pending").length) },
        { label: "Verified", value: String(suppliers.filter((supplier) => supplier.verificationStatus === "verified").length) },
        { label: "Submitted", value: String(suppliers.filter((supplier) => onboardingSubmitted(supplier.onboardingState)).length) },
        { label: "Suspended", value: String(suppliers.filter((supplier) => supplier.status === "suspended").length) },
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
            placeholder="Search suppliers..."
            defaultValue={searchQuery ?? ""}
            className="rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-3 py-2 text-[13px] text-navy outline-none min-w-[200px]"
          />
          <button type="submit" className="rounded-pill bg-mint px-4 py-2 text-sm font-semibold text-navy">
            Filter
          </button>
          {statusFilter || searchQuery ? (
            <a href="/admin/suppliers" className="text-sm text-muted underline">Clear</a>
          ) : null}
        </form>

        <form action={bulkUpdateSupplierVerification} className="flex items-center gap-2">
          {selectedIds.map((id) => (
            <input key={id} type="hidden" name="supplierIds" value={id} />
          ))}
          <input type="hidden" name="redirectTo" value="/admin/suppliers" />
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
        title="Supplier Moderation"
        empty="No suppliers yet."
        rows={suppliers}
        columns={[
          {
            label: "Business",
            value: (row) => (
              <div className="min-w-[180px]">
                <div className="font-semibold text-navy">{row.displayName}</div>
                <div className="text-xs text-muted">{row.businessName}</div>
                <div className="text-xs text-muted">/{row.slug}</div>
              </div>
            ),
          },
          { label: "Location", value: (row) => `${row.city}, ${row.country}` },
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
          { label: "Products", value: (row) => row._count.products },
          { label: "Updated", value: (row) => formatDate(row.updatedAt) },
          {
            label: "Moderation",
            value: (row) => (
              <form action={updateSupplierVerification} className="grid min-w-[260px] gap-2">
                <input type="hidden" name="supplierId" value={row.id} />
                <input type="hidden" name="redirectTo" value="/admin/suppliers" />
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
                    name="trustScore"
                    type="number"
                    min="0"
                    max="100"
                    defaultValue={row.trustScore}
                    className="w-[60px] rounded-[12px] border border-[rgb(14_42_56_/_0.12)] bg-white px-2 py-2 text-[13px] text-navy outline-none"
                    title="Trust score"
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
