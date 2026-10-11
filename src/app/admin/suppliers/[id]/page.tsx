import { notFound } from "next/navigation";
import { updateSupplierVerification } from "@/app/actions/admin";
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
          {supplier.verificationStatus !== "verified" && (
            <DecisionButtons
              action={updateSupplierVerification}
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
