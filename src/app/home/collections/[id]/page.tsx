import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { buildStorefrontOrigin } from "@/lib/domains/storefront";
import { CollectionTabs } from "./CollectionTabs";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export default async function CollectionDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  const t = await getT("products");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, customDomain: true } });
  if (!store) notFound();

  const collection = await db.collection.findFirst({
    where: { id, storeId: store.id },
    select: { name: true, type: true, slug: true, description: true, imageUrl: true },
  });
  if (!collection) notFound();

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={collection.name}
      sub={collection.type === "auto" ? t("col.autoSub") : t("col.manualSub")}
      actions={<PillLink href="/home/collections" icon="arrowLeft">{t("col.all")}</PillLink>}
    >
      <CollectionTabs id={id} name={collection.name} slug={collection.slug} description={collection.description} imageUrl={collection.imageUrl} storeOrigin={buildStorefrontOrigin({ slug: store.slug, customDomain: store.customDomain })} storeName={store.name} />
    </AppPage>
  );
}
