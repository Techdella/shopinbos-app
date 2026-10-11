import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { ShippingZoneForm } from "../ShippingZoneForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Add delivery zone" };

export default async function NewShippingZonePage() {
  const user = await requireRole(["seller"], "/login");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true, currency: true } });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title="Add delivery zone"
      sub="Set the areas this zone covers and the delivery fee shoppers there pay at checkout."
      actions={<PillLink href="/home/shipping">All zones</PillLink>}
    >
      {store ? (
        <ShippingZoneForm currency={store.currency ?? "NGN"} />
      ) : (
        <EmptyState icon="shop" title="Set up your store first" action={<PillLink href="/onboarding" tone="ink">Set up store</PillLink>}>
          Delivery zones belong to a store. Create your store, then come back to add delivery fees.
        </EmptyState>
      )}
    </SellerPage>
  );
}
