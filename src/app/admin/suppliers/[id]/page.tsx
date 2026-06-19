import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { RolePage, formatDate } from "@/components/role/RolePage";
import { StatusPill } from "@/components/ops/OpsPrimitives";
import { AdminDocumentViewer } from "@/components/verification/AdminDocumentViewer";
import type { VerificationDoc } from "@/app/actions/verification";
import { notFound } from "next/navigation";

export default async function AdminSupplierDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"], "/admin/login");

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

  const docs = (supplier.verificationDocuments as VerificationDoc[]) ?? [];

  return (
    <RolePage
      role="admin"
      eyebrow={`/admin/suppliers/${id}`}
      title={supplier.displayName}
      description={`${supplier.businessName} · /${supplier.slug} · ${supplier.city}, ${supplier.country}`}
      metrics={[
        { label: "Verification", value: <StatusPill status={supplier.verificationStatus} /> },
        { label: "Status", value: <StatusPill status={supplier.status} /> },
        { label: "Trust Score", value: `${supplier.trustScore ?? 0}/100` },
        { label: "Products", value: String(supplier._count.products) },
        { label: "Documents", value: String(docs.length) },
        { label: "Created", value: formatDate(supplier.createdAt) },
      ]}
    >
      <AdminDocumentViewer
        role="supplier"
        entityId={supplier.id}
        docs={docs}
        verificationStatus={supplier.verificationStatus}
        trustScore={supplier.trustScore ?? 0}
      />
    </RolePage>
  );
}
