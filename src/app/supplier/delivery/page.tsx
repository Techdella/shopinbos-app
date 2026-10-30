import type { Metadata } from "next";
import { AppPage, Card, CardHead, PillLink } from "@/components/app-kit";
import { pillButton } from "@/components/seller-core";
import { supplierFrame } from "@/components/supplier/supplier-kit";
import { requireRole } from "@/lib/server-auth";
import { getSupplierForUser } from "@/lib/role-queries";
import { deliverySettingsFor } from "@/lib/delivery-market/market.server";
import { connectionsForOwner, findPartners, privateCardsForOwner } from "@/lib/delivery-market/manage.server";
import { saveDeliverySettingsAction } from "@/app/actions/delivery-market";
import { Field, FlashNotice, OriginFields, SizeBandSelect } from "@/components/delivery-market/bits";
import { MyPartners } from "@/components/delivery-market/MyPartners";
import { FindPartners } from "@/components/delivery-market/FindPartners";
import { originLabel, readFindFilters, type FindSearch } from "@/components/delivery-market/find-filters";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";
import { DeliveryRateCard } from "@/components/supplier/DeliveryRateCard";
import { supplierDeliveryRates } from "@/lib/supplier-dropship.server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("delivery"))("supplier.title") };
}

type Search = FindSearch & { saved?: string; error?: string };

// A supplier's side of the logistics marketplace: where parcels leave from, their usual size, their delivery
// partners (who ship dropship orders from the supplier to the customer) and private rates.
export default async function SupplierDeliveryPage({ searchParams }: { searchParams: Promise<Search> }) {
  const params = await searchParams;
  const user = await requireRole(["supplier"], "/supplier/login");
  const supplier = await getSupplierForUser(user);
  const filters = readFindFilters(params);
  const t = await getT("delivery");
  const tipT = await getT("tips");
  const [settings, connections, cards, found, rates] = await Promise.all([
    deliverySettingsFor(user.id),
    connectionsForOwner(user.id),
    privateCardsForOwner(user.id),
    findPartners({ id: user.id, role: user.role }, filters),
    supplierDeliveryRates(user.id),
  ]);

  return (
    <AppPage
      frame={supplierFrame(user, supplier)}
      title={t("supplier.title")}
      sub={t("supplier.sub")}
      actions={
        <>
          <PillLink href="/supplier/delivery/analytics" icon="chart">{t("an.title")}</PillLink>
        </>
      }
    >
      <PageTip who="peggy" className="mb-5">{tipT("supplier.delivery")}</PageTip>
      <FlashNotice saved={params.saved} error={params.error} />
      <div className="grid gap-8">
        <form action={saveDeliverySettingsAction}>
          <input type="hidden" name="back" value="/supplier/delivery" />
          <Card className="p-5">
            <CardHead title={t("supplier.origin")} sub={t("supplier.originSub")} />
            <div className="mt-4 grid gap-4">
              <OriginFields settings={settings} />
              <div className="max-w-[420px]">
                <Field label={t("settings.usualSize")} hint={t("supplier.usualSizeHint")}>
                  <SizeBandSelect defaultValue={settings.defaultSizeBand} />
                </Field>
              </div>
              <div className="flex justify-end">
                <button type="submit" className={pillButton.ink}>{t("save")}</button>
              </div>
            </div>
          </Card>
        </form>
        {/* Delivery prices (shared/dropship-rules.ts): partner rates, or the supplier's own zone × size card. */}
        <section aria-labelledby="delivery-prices-title" className="grid gap-3">
          <div className="px-1">
            <h2 id="delivery-prices-title" className="m-0 font-app-display text-[22px] font-extrabold tracking-[-0.02em]">Delivery prices</h2>
            <p className="mb-0 mt-0.5 text-[13.5px] text-app-ink-soft">Checkout shows customers the fee and arrival date, worked out from these prices and their address.</p>
          </div>
          <DeliveryRateCard initial={rates} />
        </section>
        <MyPartners role="supplier" connections={connections} cards={cards} detailBase="/supplier/delivery/partners" back="/supplier/delivery" findHref="/supplier/delivery#find" />
        <FindPartners found={found} filters={filters} path="/supplier/delivery" detailBase="/supplier/delivery/partners" back="/supplier/delivery" originLabel={originLabel(found.origin)} />
      </div>
    </AppPage>
  );
}
