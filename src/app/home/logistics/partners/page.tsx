import type { Metadata } from "next";
import Link from "next/link";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { requireRole } from "@/lib/server-auth";
import { getSellerWorkspace } from "@/lib/workspace";
import { connectionsForOwner, findPartners, privateCardsForOwner } from "@/lib/delivery-market/manage.server";
import { FlashNotice } from "@/components/delivery-market/bits";
import { MyPartners } from "@/components/delivery-market/MyPartners";
import { FindPartners } from "@/components/delivery-market/FindPartners";
import { originLabel, readFindFilters, type FindSearch } from "@/components/delivery-market/find-filters";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Delivery partners" };

type Search = FindSearch & { saved?: string; error?: string };

// The shop's delivery partners (what customers see for each, pay on delivery, private rates) and "Find partners".
export default async function DeliveryPartnersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await requireRole(["seller"], "/login");
  const workspace = await getSellerWorkspace(user.id);
  if (!workspace) return null;
  const filters = readFindFilters(params);
  const [connections, cards, found] = await Promise.all([
    connectionsForOwner(user.id),
    privateCardsForOwner(user.id),
    findPartners({ id: user.id, role: user.role }, filters),
  ]);

  return (
    <AppPage
      frame={sellerFrame(user, workspace.store)}
      title="Delivery partners"
      sub="Connect delivery partners and choose what your customers see at checkout."
      actions={
        <>
          <PillLink href="/home/logistics" icon="arrowLeft">Logistics</PillLink>
          <PillLink href="/home/logistics/settings" icon="settings">Delivery settings</PillLink>
        </>
      }
    >
      <FlashNotice saved={params.saved} error={params.error} />
      {found.settings.checkoutMode !== "partners" && (
        <p className="mb-5 mt-0 rounded-[16px] bg-app-canvas px-4 py-3 text-[14px] leading-[1.5]">
          Your checkout uses your own delivery zones. To show customers your partners&apos; options, switch &quot;Delivery at checkout&quot; to delivery partners in{" "}
          <Link href="/home/logistics/settings" className="font-bold text-app-accent-ink no-underline hover:underline">Delivery settings</Link>.
        </p>
      )}
      <div className="grid gap-8">
        <MyPartners role="seller" connections={connections} cards={cards} detailBase="/home/logistics/partners" back="/home/logistics/partners" findHref="/home/logistics/partners#find" />
        <FindPartners found={found} filters={filters} path="/home/logistics/partners" detailBase="/home/logistics/partners" back="/home/logistics/partners" originLabel={originLabel(found.origin)} />
      </div>
    </AppPage>
  );
}
