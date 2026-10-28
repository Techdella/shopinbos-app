import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { getT } from "@/lib/i18n/server";
import { mySupplierProducts } from "@/lib/marketplace/quick-add.server";
import { DEFAULT_MARKUP } from "@shared/supplier-markup";
import { MineView } from "../_components/MineView";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("marketplace");
  return { title: t("mine.heading") };
}

// My supplier products (web; the phone's app/find/mine.tsx): the supplier products in the shop, to change the price or
// markup of many at once, or remove them. The seller's markup for new adds is edited at the top (#markup).

export default async function MySupplierProductsPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("marketplace");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  if (!store) redirect("/builder?firstRun=1");
  const found = await mySupplierProducts(user.id);
  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("mine.heading")}
      sub={t("mine.sub")}
      actions={<PillLink href="/marketplace" icon="search">{t("mine.find")}</PillLink>}
    >
      <MineView products={found?.products ?? []} markup={found?.markup ?? DEFAULT_MARKUP} />
    </SellerPage>
  );
}
