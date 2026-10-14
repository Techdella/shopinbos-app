import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { AppPage, PillLink } from "@/components/app-kit";
import { sellerFrame } from "@/components/seller-core";
import { CategoriesClient } from "./CategoriesClient";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("products");
  return { title: t("cat.title") };
}

export default async function SellerCategoriesPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("products");
  const { new: openForm } = await searchParams;
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });

  return (
    <AppPage
      frame={sellerFrame(user, store)}
      title={t("cat.title")}
      sub={t("cat.sub")}
      actions={<PillLink href="/home/categories?new=1" tone="accent" icon="plus">{t("cat.add")}</PillLink>}
    >
      <CategoriesClient startOpen={openForm === "1"} />
    </AppPage>
  );
}
