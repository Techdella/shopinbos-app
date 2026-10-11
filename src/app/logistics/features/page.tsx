import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/server-auth";
import { db } from "@/lib/db/client";
import { PartnerPage } from "@/components/logistics/kit";
import { CustomiseMenu } from "@/components/settings/CustomiseMenu";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Customise your menu" };

export default async function PartnerFeaturesPage() {
  const user = await requireRole(["logistics_partner"], "/logistics/login");
  const partner = await db.logisticsPartner.findUnique({ where: { userId: user.id }, select: { displayName: true, city: true, logoUrl: true, verificationStatus: true } });
  if (!partner) redirect("/logistics/onboarding");
  return (
    <PartnerPage frame={{ user, partner }} title="Customise your menu" sub="Switch off the parts of Shopinbos Partners you don't need. They leave your menu; nothing is deleted.">
      <CustomiseMenu role="logistics_partner" />
    </PartnerPage>
  );
}
