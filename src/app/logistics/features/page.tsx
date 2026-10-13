import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { PartnerPage } from "@/components/logistics/kit";
import { CustomiseMenu } from "@/components/settings/CustomiseMenu";
import { getT } from "@/lib/i18n/server";

export const dynamic = "force-dynamic";
export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getT("logistics"))("features.title") };
}

export default async function PartnerFeaturesPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { displayName: true, city: true, logoUrl: true, verificationStatus: true } });
  if (!partner) redirect("/logistics/onboarding");
  const t = await getT("logistics");
  return (
    <PartnerPage frame={{ user, partner }} title={t("features.title")} sub={t("features.sub")}>
      <CustomiseMenu role="logistics_partner" />
    </PartnerPage>
  );
}
