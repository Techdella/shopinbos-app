import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { ShippingZoneForm } from "../ShippingZoneForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Edit delivery zone" };

export default async function EditShippingZonePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
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
      title="Edit delivery zone"
      sub={zone.name}
      actions={<PillLink href="/home/shipping">All zones</PillLink>}
    >
      <ShippingZoneForm
        currency={store.currency ?? "NGN"}
        zone={{ id: zone.id, name: zone.name, regions: zone.regions, rates, sortOrder: zone.sortOrder, active: zone.active }}
      />
    </SellerPage>
  );
}
