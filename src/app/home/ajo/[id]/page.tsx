import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { SellerPage, storeSummary } from "@/components/seller/SellerPage";
import { PillLink } from "@/components/app-kit";
import { featureOn } from "@/lib/feature-switches.server";
import { getT } from "@/lib/i18n/server";
import { AjoGroupDetail } from "@/components/together/AjoDashboard";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  const t = await getT("together");
  return { title: t("ajoList.title") };
}

// One ajo group (pilot "ajo"): this week's payments, who to ship to, the collection order and every contribution.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireRole(["seller"], "/login");
  if (!(await featureOn(user.id, "ajo"))) notFound();
  const t = await getT("together");
  const store = await db.store.findUnique({ where: { userId: user.id }, select: { id: true, name: true, slug: true, logoUrl: true, currency: true } });
  return (
    <SellerPage user={user} store={storeSummary(store)} title={t("ajoList.title")} sub={t("ajoList.sub")}
      actions={<PillLink href="/home/ajo" icon="arrowLeft" iconOnlyOnPhone>{t("ajoList.title")}</PillLink>}>
      <AjoGroupDetail groupId={id} />
    </SellerPage>
  );
}
