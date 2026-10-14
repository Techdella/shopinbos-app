import type { Metadata } from "next";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { CustomiseMenu } from "@/components/settings/CustomiseMenu";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("store");
  return { title: t("feat.title") };
}

export default async function SellerFeaturesPage() {
  const user = await requireRole(["seller"], "/login");
  const t = await getT("store");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { name: true, slug: true, logoUrl: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("feat.title")} sub={t("feat.sub")}>
      <CustomiseMenu role="seller" />
    </SellerPage>
  );
}
