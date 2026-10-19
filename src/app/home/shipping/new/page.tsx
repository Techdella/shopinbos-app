import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { ShippingZoneForm } from "../ShippingZoneForm";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("shipping");
  return { title: t("new.title") };
}

export default async function NewShippingZonePage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("shipping");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true, currency: true } });

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("new.title")}
      sub={t("new.sub")}
      actions={<PillLink href="/home/shipping">{t("allZones")}</PillLink>}
    >
      {store ? (
        <ShippingZoneForm currency={store.currency ?? "NGN"} />
      ) : (
        <EmptyState icon="shop" title={t("new.noStore")} action={<PillLink href="/onboarding" tone="ink">{t("new.setUp")}</PillLink>}>
          {t("new.noStoreSub")}
        </EmptyState>
      )}
    </SellerPage>
  );
}
