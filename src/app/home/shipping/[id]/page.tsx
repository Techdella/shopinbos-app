import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { AssistantNote, PillLink } from "@/components/app-kit";
import { DeliveryTip } from "@/components/delivery-market/DeliveryTip";
import { ShippingZoneForm } from "../ShippingZoneForm";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("shipping");
  return { title: t("edit.title") };
}

export default async function EditShippingZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("shipping");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  if (!store) notFound();
  const zone = await db.shippingZone.findFirst({ where: { id, storeId: store.id } });
  if (!zone) notFound();

  const rates = (Array.isArray(zone.rates) ? zone.rates : []).filter(
    (rate) => !!rate && typeof rate === "object" && !Array.isArray(rate),
  ) as Array<Record<string, unknown>>;

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("edit.title")}
      sub={zone.name}
      actions={<PillLink href="/home/shipping">{t("allZones")}</PillLink>}
    >
      <div className="grid gap-4">
        <DeliveryTip>
          <AssistantNote who="peggy">{t("tip.form")}</AssistantNote>
        </DeliveryTip>
        <ShippingZoneForm
          currency={store.currency ?? "NGN"}
          zone={{ id: zone.id, name: zone.name, regions: zone.regions, rates, sortOrder: zone.sortOrder, active: zone.active }}
        />
      </div>
    </SellerPage>
  );
}
