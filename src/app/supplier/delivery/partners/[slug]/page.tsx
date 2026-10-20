import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { partnerDetail } from "@/lib/delivery-market/manage.server";
import { FlashNotice } from "@/components/delivery-market/bits";
import { PartnerDetail } from "@/components/delivery-market/PartnerDetail";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery partner" };

export default async function SupplierPartnerDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { slug } = await params;
  const flash = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  const detail = await partnerDetail(slug, user.id);
  if (!detail) notFound();

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={detail.partner.displayName}
      sub="Rates, coverage, pickup points and reviews."
      actions={<PillLink href="/supplier/delivery" icon="arrowLeft">Delivery</PillLink>}
    >
      <FlashNotice saved={flash.saved} error={flash.error} />
      <PartnerDetail detail={detail} role="supplier" back={`/supplier/delivery/partners/${detail.partner.slug}`} />
    </AppPage>
  );
}
