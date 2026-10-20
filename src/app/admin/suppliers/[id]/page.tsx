import { notFound } from "next/navigation";
import { updateSupplierVerification } from "@/app/actions/admin";
import { setSupplierAcceptHours } from "@/app/actions/admin-supplier-orders";
import { AppPage, Pill, PillLink, StatTile, Thumb } from "@/components/app-kit";
import { DecisionButtons, VerificationPill, adminFrame, formatDate } from "@/components/admin/AdminKit";
import { AdminDocumentViewer } from "@/components/verification/AdminDocumentViewer";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { parseVerificationDocs } from "@/lib/verification-utils";

export default async function AdminSupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  const user = await requireRole(["admin"], "/admin/login");

  const { id } = await props.params;

  const supplier = await db.supplier.findUnique({
    where: { id },
    select: {
      userId: true,
      id: true,
      displayName: true,
      businessName: true,
      slug: true,
      country: true,
      city: true,
      logoUrl: true,
      verificationStatus: true,
      status: true,
      trustScore: true,
      acceptHoursDropship: true,
      acceptHoursWholesale: true,
      missedOrders: true,
      verificationDocuments: true,
      createdAt: true,
      updatedAt: true,
      _count: { select: { products: true } },
    },
  });

  if (!supplier) notFound();

  const docs = parseVerificationDocs(supplier.verificationDocuments);

  return (
    <AppPage
      frame={adminFrame(user, "Search suppliers")}
      title={
        <span className="flex min-w-0 items-center gap-3">
          <Thumb src={supplier.logoUrl} label={supplier.displayName} size={48} />
          <span className="min-w-0 break-words">{supplier.displayName}</span>
        </span>
      }
      sub={`${supplier.businessName} · /${supplier.slug} · ${supplier.city}, ${supplier.country}`}
      actions={
        <>
          <PillLink href="/admin/suppliers" icon="arrowLeft">All suppliers</PillLink>
          <PillLink href={`/admin/support/new?to=user:${supplier.userId}`} icon="chat">Message</PillLink>
          {supplier.verificationStatus !== "verified" && (
            <DecisionButtons
              action={updateSupplierVerification}
              followUp
              fields={{ supplierId: supplier.id, trustScore: String(supplier.trustScore ?? 0), redirectTo: `/admin/suppliers/${supplier.id}` }}
              approve="verified"
              reject="rejected"
              subject={supplier.displayName}
            />
          )}
        </>
      }
    >
      <section aria-label="Supplier summary" className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 2xl:grid-cols-6">
        <StatTile tone="card" label="Verification" value={<VerificationPill status={supplier.verificationStatus} />} />
        <StatTile tone="card" label="Account" value={<Pill tone={supplier.status === "active" ? "success" : "danger"} dot>{supplier.status === "active" ? "Active" : supplier.status}</Pill>} />
        <StatTile tone="card" label="Trust score" value={`${supplier.trustScore ?? 0}/100`} />
        <StatTile tone="card" label="Products" value={supplier._count.products} />
        <StatTile tone="card" label="Documents" value={docs.length} />
        <StatTile tone="card" label="Joined" value={<span className="text-[20px]">{formatDate(supplier.createdAt)}</span>} />
      </section>

      <section aria-labelledby="accept-hours" className="mb-5 rounded-[18px] border border-app-line bg-white p-5">
        <h2 id="accept-hours" className="m-0 text-[17px] font-extrabold">Time to accept new orders</h2>
        <p className="m-0 mt-1 text-[14px] text-app-ink-soft">
          Leave empty for the default ({process.env.SUPPLIER_ACCEPT_HOURS_DROPSHIP || "4"} h for orders shops sold, {process.env.SUPPLIER_ACCEPT_HOURS_WHOLESALE || "24"} h for bulk orders). Missed so far: {supplier.missedOrders}.
        </p>
        <form action={setSupplierAcceptHours} className="mt-3 flex flex-wrap items-end gap-3">
          <input type="hidden" name="supplierId" value={supplier.id} />
          <label className="grid gap-1 text-[13.5px] font-bold">Orders shops sold (hours)
            <input name="acceptHoursDropship" type="number" min={1} max={168} defaultValue={supplier.acceptHoursDropship ?? ""} className="min-h-[40px] w-[140px] rounded-full border border-app-line px-4 font-normal" />
          </label>
          <label className="grid gap-1 text-[13.5px] font-bold">Bulk orders (hours)
            <input name="acceptHoursWholesale" type="number" min={1} max={168} defaultValue={supplier.acceptHoursWholesale ?? ""} className="min-h-[40px] w-[140px] rounded-full border border-app-line px-4 font-normal" />
          </label>
          <button type="submit" className="inline-flex min-h-[40px] items-center rounded-full bg-app-ink px-4 text-[13.5px] font-extrabold text-white">Save</button>
        </form>
      </section>

      <AdminDocumentViewer
        role="supplier"
        entityId={supplier.id}
        docs={docs}
        verificationStatus={supplier.verificationStatus}
        trustScore={supplier.trustScore ?? 0}
      />
    </AppPage>
  );
}
