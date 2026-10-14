import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { EmptyState, PillLink } from "@/components/app-kit";
import { NewPageForm } from "./NewPageForm";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await getT("store");
  return { title: t("pages.new") };
}

export default async function NewPageModal() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("store");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true } });
  const existing = store
    ? await db.storePage.findMany({ where: { storeId: store.id }, select: { id: true, slug: true, title: true } })
    : [];

  return (
    <SellerPage
      user={user}
      store={storeSummary(store)}
      title={t("pages.new")}
      sub={t("pages.newSub")}
      actions={<PillLink href="/home/pages" icon="arrowLeft">{t("pages.backToPages")}</PillLink>}
    >
      {store ? (
        <NewPageForm existing={existing} />
      ) : (
        <EmptyState icon="document" title={t("pages.noStore")} action={<PillLink href="/onboarding" tone="ink">{t("pages.setUpStore")}</PillLink>}>
          {t("pages.setUpFirst")}
        </EmptyState>
      )}
    </SellerPage>
  );
}
