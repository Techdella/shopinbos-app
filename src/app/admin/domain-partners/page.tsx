import { AppPage } from "@/components/app-kit";
import { adminFrame } from "@/components/admin/AdminKit";
import { DomainPartnersManager } from "@/components/admin/DomainPartnersManager";
import { db } from "@/lib/db/client";
import { requireRole } from "@/lib/server-auth";

export default async function AdminDomainPartnersPage() {
  const user = await requireRole(["admin"], "/admin/login");

  // Same order as GET /api/admin/domain-partners, which the manager uses to refresh after changes.
  const partners = await db.domainPartner.findMany({
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, name: true, baseUrl: true, affiliateUrl: true, logoUrl: true, description: true, featured: true, sortOrder: true, active: true, createdAt: true },
  });

  return (
    <AppPage
      frame={adminFrame(user, "Search domain partners")}
      title="Domain partners"
      sub="Registrars shown to sellers on their Domain settings page. Add an affiliate link and we earn when a seller buys through it."
    >
      <DomainPartnersManager initialPartners={partners.map((partner) => ({ ...partner, createdAt: partner.createdAt.toISOString() }))} />
    </AppPage>
  );
}
