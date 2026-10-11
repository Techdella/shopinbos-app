import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";
import { RolePage, formatDate } from "@/components/role/RolePage";
import { StatusPill } from "@/components/ops/OpsPrimitives";
import { AdminDocumentViewer } from "@/components/verification/AdminDocumentViewer";
import { parseVerificationDocs, type VerificationDoc } from "@/lib/verification-utils";
import { notFound } from "next/navigation";

export default async function AdminLogisticsDetailPage(props: { params: Promise<{ id: string }> }) {
  await requireRole(["admin"], "/admin/login");

  const { id } = await props.params;

  const partner = await db.logisticsPartner.findUnique({
    where: { id },
    select: {
      id: true,
      displayName: true,
      companyName: true,
      slug: true,
      country: true,
      city: true,
      verificationStatus: true,
      status: true,
      reliabilityScore: true,
      verificationDocuments: true,
      basePrice: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!partner) notFound();

  const docs = parseVerificationDocs(partner.verificationDocuments);

  return (
    <RolePage
      role="admin"
      eyebrow={`/admin/logistics-partners/${id}`}
      title={partner.displayName}
      description={`${partner.companyName} · /${partner.slug} · ${partner.city}, ${partner.country}`}
      metrics={[
        { label: "Verification", value: <StatusPill status={partner.verificationStatus} /> },
        { label: "Status", value: <StatusPill status={partner.status} /> },
        { label: "Reliability Score", value: `${partner.reliabilityScore ?? 0}/100` },
        { label: "Base Price", value: partner.basePrice ? `₦${Number(partner.basePrice).toLocaleString()}` : "—" },
        { label: "Documents", value: String(docs.length) },
        { label: "Created", value: formatDate(partner.createdAt) },
      ]}
    >
      <AdminDocumentViewer
        role="logistics_partner"
        entityId={partner.id}
        docs={docs}
        verificationStatus={partner.verificationStatus}
        trustScore={partner.reliabilityScore ?? 0}
      />
    </RolePage>
  );
}
