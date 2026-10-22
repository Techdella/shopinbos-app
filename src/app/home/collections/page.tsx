import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { CollectionsClient } from "./CollectionsClient";
import { getT } from "@/lib/i18n/server";
import { PageTip } from "@/components/learn/PageTip";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("products");
  return { title: t("col.title") };
}

export default async function SellerCollectionsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const tipT = await getT("tips");
  const t = await getT("products");
  const { new: openForm } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("col.title")}
      sub={t("col.sub")}
      actions={<PillLink href="/home/collections?new=1" tone="accent" icon="plus">{t("col.create")}</PillLink>}
    >
      <PageTip className="mb-5">{tipT("collections")}</PageTip>
      <CollectionsClient startOpen={openForm === "1"} />
    </AppPage>
  );
}
