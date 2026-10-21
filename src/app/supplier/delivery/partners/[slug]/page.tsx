import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { partnerDetail } from "@/lib/delivery-market/manage.server";
import { FlashNotice } from "@/components/delivery-market/bits";
import { PartnerDetail } from "@/components/delivery-market/PartnerDetail";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("detail.metaTitle") };
}

export default async function SupplierPartnerDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { slug } = await params;
  const flash = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  const detail = await partnerDetail(slug, user.id);
  if (!detail) notFound();
  const t = await getT("delivery");

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={detail.partner.displayName}
      sub={t("detail.sub")}
      actions={<PillLink href="/supplier/delivery" icon="arrowLeft">{t("supplier.title")}</PillLink>}
    >
      <FlashNotice saved={flash.saved} error={flash.error} />
      <PartnerDetail detail={detail} role="supplier" back={`/supplier/delivery/partners/${detail.partner.slug}`} />
    </AppPage>
  );
}
