import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, AssistantNote, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { connectionsForOwner, findPartners, privateCardsForOwner } from "@/lib/delivery-market/manage.server";
import { FlashNotice } from "@/components/delivery-market/bits";
import { MyPartners } from "@/components/delivery-market/MyPartners";
import { FindPartners } from "@/components/delivery-market/FindPartners";
import { originLabel, readFindFilters, type FindSearch } from "@/components/delivery-market/find-filters";
import { DeliveryTip } from "@/components/delivery-market/DeliveryTip";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("partners.title") };
}

type Search = FindSearch & { saved?: string; error?: string };

// The shop's delivery partners (what customers see for each, pay on delivery, private rates) and "Find partners".
export default async function DeliveryPartnersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  const filters = readFindFilters(params);
  const t = await getT("delivery");
  const [connections, cards, found] = await Promise.all([
    connectionsForOwner(user.id),
    privateCardsForOwner(user.id),
    findPartners({ id: user.id, role: user.role }, filters),
  ]);

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title={t("partners.title")}
      sub={t("partners.sub")}
      actions={
        <>
          <PillLink href="/home/logistics" icon="arrowLeft">{t("logistics")}</PillLink>
          <PillLink href="/home/logistics/settings" icon="settings">{t("settings.title")}</PillLink>
        </>
      }
    >
      <FlashNotice saved={params.saved} error={params.error} />
      <DeliveryTip>
        <div className="mb-5"><AssistantNote who="peggy">{t("partners.tip")}</AssistantNote></div>
      </DeliveryTip>
      {found.settings.checkoutMode !== "partners" && (
        <p className="mb-5 mt-0 rounded-[16px] bg-app-canvas px-4 py-3 text-[14px] leading-[1.5]">
          {t("partners.zonesNote")}{" "}
          <Link href="/home/logistics/settings" className="font-bold text-app-accent-ink no-underline hover:underline">{t("settings.title")}</Link>.
        </p>
      )}
      <div className="grid gap-8">
        <MyPartners role="seller" connections={connections} cards={cards} detailBase="/home/logistics/partners" back="/home/logistics/partners" findHref="/home/logistics/partners#find" />
        <FindPartners found={found} filters={filters} path="/home/logistics/partners" detailBase="/home/logistics/partners" back="/home/logistics/partners" originLabel={originLabel(found.origin)} />
      </div>
    </AppPage>
  );
}
