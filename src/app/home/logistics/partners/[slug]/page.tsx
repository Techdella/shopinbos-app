import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { partnerDetail } from "@/lib/delivery-market/manage.server";
import { FlashNotice } from "@/components/delivery-market/bits";
import { PartnerDetail } from "@/components/delivery-market/PartnerDetail";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("detail.metaTitle") };
}

export default async function SellerPartnerDetailPage({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ saved?: string; error?: string }> }) {
  const { slug } = await params;
  const flash = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  const detail = await partnerDetail(slug, user.id);
  if (!detail) notFound();
  const t = await getT("delivery");

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={detail.partner.displayName}
      sub={t("detail.sub")}
      actions={<PillLink href="/home/logistics/partners" icon="arrowLeft">{t("partners.title")}</PillLink>}
    >
      <FlashNotice saved={flash.saved} error={flash.error} />
      <PartnerDetail detail={detail} role="seller" back={`/home/logistics/partners/${detail.partner.slug}`} />
    </AppPage>
  );
}
